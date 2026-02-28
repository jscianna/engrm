#!/usr/bin/env python3
"""
MEMRY Zero-Knowledge CLI

True zero-knowledge: embeddings and encryption happen locally.
Server only receives vectors + encrypted blobs - cannot read your data.

Dependencies:
    pip install fastembed pycryptodome

Usage:
    python memry_zk.py store "Your memory content"
    python memry_zk.py search "What to find"
    python memry_zk.py context "Current task"
    python memry_zk.py list
"""

import argparse
import json
import os
import struct
import sys
from base64 import b64encode, b64decode
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# Lazy imports for heavy dependencies
_embedder = None
_crypto_available = False

def get_config():
    """Load API key, URL, vault password, and namespace from environment or secrets file."""
    api_key = os.environ.get("MEMRY_API_KEY")
    api_url = os.environ.get("MEMRY_API_URL", "https://memry-sand.vercel.app")
    vault_password = os.environ.get("MEMRY_VAULT_PASSWORD")
    
    # Auto-namespace: MEMRY_NAMESPACE > MEMRY_CHAT_ID > MEMRY_SESSION_ID
    namespace = (
        os.environ.get("MEMRY_NAMESPACE") or
        os.environ.get("MEMRY_CHAT_ID") or
        os.environ.get("MEMRY_SESSION_ID")
    )
    
    # Try secrets file if not in env
    secrets_path = Path.home() / ".openclaw" / "secrets" / "memry.env"
    if secrets_path.exists():
        for line in secrets_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, value = line.split("=", 1)
                value = value.strip().strip('"\'')
                if key == "MEMRY_API_KEY" and not api_key:
                    api_key = value
                elif key == "MEMRY_API_URL" and api_url == "https://memry-sand.vercel.app":
                    api_url = value
                elif key == "MEMRY_VAULT_PASSWORD" and not vault_password:
                    vault_password = value
                elif key == "MEMRY_NAMESPACE" and not namespace:
                    namespace = value
    
    if not api_key:
        print("Error: MEMRY_API_KEY not set.", file=sys.stderr)
        print("Set via environment or ~/.openclaw/secrets/memry.env", file=sys.stderr)
        sys.exit(1)
    
    if not vault_password:
        print("Error: MEMRY_VAULT_PASSWORD not set.", file=sys.stderr)
        print("Required for zero-knowledge encryption.", file=sys.stderr)
        sys.exit(1)
    
    return api_key, api_url.rstrip("/"), vault_password, namespace


def get_namespace():
    """Get current namespace from config."""
    _, _, _, namespace = get_config()
    return namespace


# =============================================================================
# LOCAL EMBEDDINGS (FastEmbed ONNX)
# =============================================================================

def get_embedder():
    """Lazy-load FastEmbed model."""
    global _embedder
    if _embedder is None:
        try:
            from fastembed import TextEmbedding
        except ImportError:
            print("Error: fastembed not installed.", file=sys.stderr)
            print("Run: pip install fastembed", file=sys.stderr)
            sys.exit(1)
        
        print("[ZK] Loading local embedding model...", file=sys.stderr)
        # Use same model family as MCP server (all-MiniLM-L6-v2)
        _embedder = TextEmbedding(
            model_name="sentence-transformers/all-MiniLM-L6-v2",
            cache_dir=str(Path.home() / ".cache" / "memry" / "models")
        )
        print("[ZK] Embedding model ready", file=sys.stderr)
    return _embedder


def embed_local(text: str) -> list:
    """Generate embedding vector locally - text never leaves device."""
    embedder = get_embedder()
    # Truncate to model's max length
    truncated = text[:512]
    embeddings = list(embedder.embed([truncated]))
    return embeddings[0].tolist()


# =============================================================================
# LOCAL ENCRYPTION (AES-256-GCM, matching Node.js crypto)
# =============================================================================

def check_crypto():
    """Check if pycryptodome is available."""
    global _crypto_available
    try:
        from Crypto.Cipher import AES
        from Crypto.Protocol.KDF import PBKDF2
        from Crypto.Random import get_random_bytes
        _crypto_available = True
        return True
    except ImportError:
        print("Error: pycryptodome not installed.", file=sys.stderr)
        print("Run: pip install pycryptodome", file=sys.stderr)
        sys.exit(1)


def derive_key(password: str, salt: bytes) -> bytes:
    """Derive encryption key from password - MUST match Node.js crypto.pbkdf2Sync."""
    from Crypto.Protocol.KDF import PBKDF2
    from Crypto.Hash import SHA256
    
    # Match Node.js: PBKDF2-SHA256, 100K iterations, 32-byte key
    return PBKDF2(
        password.encode('utf-8'),
        salt,
        dkLen=32,
        count=100000,
        hmac_hash_module=SHA256
    )


def encrypt_local(plaintext: str, password: str) -> dict:
    """Encrypt text locally - matches Node.js AES-256-GCM exactly."""
    check_crypto()
    from Crypto.Cipher import AES
    from Crypto.Random import get_random_bytes
    
    # Generate random salt and IV (matching Node.js lengths)
    salt = get_random_bytes(16)  # 16 bytes
    iv = get_random_bytes(12)    # 12 bytes for GCM
    
    key = derive_key(password, salt)
    cipher = AES.new(key, AES.MODE_GCM, nonce=iv)
    
    ciphertext, tag = cipher.encrypt_and_digest(plaintext.encode('utf-8'))
    
    # Return in same format as Node.js MCP server
    return {
        "ciphertext": b64encode(ciphertext).decode('ascii'),
        "iv": b64encode(iv).decode('ascii'),
        "tag": b64encode(tag).decode('ascii'),
        "salt": b64encode(salt).decode('ascii'),
    }


def decrypt_local(encrypted: dict, password: str) -> str:
    """Decrypt data locally - matches Node.js AES-256-GCM exactly."""
    check_crypto()
    from Crypto.Cipher import AES
    
    salt = b64decode(encrypted["salt"])
    iv = b64decode(encrypted["iv"])
    tag = b64decode(encrypted["tag"])
    ciphertext = b64decode(encrypted["ciphertext"])
    
    key = derive_key(password, salt)
    cipher = AES.new(key, AES.MODE_GCM, nonce=iv)
    cipher.update(b'')  # No additional authenticated data
    
    plaintext = cipher.decrypt_and_verify(ciphertext, tag)
    return plaintext.decode('utf-8')


# =============================================================================
# API CLIENT (Zero-Knowledge endpoints only)
# =============================================================================

def api_request(method: str, endpoint: str, data: dict = None):
    """Make authenticated API request."""
    api_key, api_url, _, _ = get_config()
    url = f"{api_url}{endpoint}"
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    
    body = json.dumps(data).encode() if data else None
    req = Request(url, data=body, headers=headers, method=method)
    
    try:
        with urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        error_body = e.read().decode() if e.fp else ""
        try:
            error_json = json.loads(error_body)
            print(f"Error: {error_json.get('error', error_body)}", file=sys.stderr)
        except:
            print(f"Error: {e.code} {e.reason} - {error_body}", file=sys.stderr)
        sys.exit(1)
    except URLError as e:
        print(f"Error: {e.reason}", file=sys.stderr)
        sys.exit(1)


# =============================================================================
# COMMANDS
# =============================================================================

def cmd_store(args):
    """Store a memory with zero-knowledge encryption."""
    _, _, vault_password, auto_namespace = get_config()
    namespace = getattr(args, 'namespace', None) or auto_namespace
    
    print("[ZK] Encrypting locally...", file=sys.stderr)
    
    # Generate title from first line
    title = args.title or args.text[:100]
    
    # Encrypt locally - server will never see plaintext
    encrypted_title = json.dumps(encrypt_local(title, vault_password))
    encrypted_content = json.dumps(encrypt_local(args.text, vault_password))
    
    print("[ZK] Generating embedding locally...", file=sys.stderr)
    
    # Embed locally - query text never leaves device
    vector = embed_local(args.text)
    
    # Build metadata
    metadata = {"zk": True}
    if args.importance:
        metadata["importance"] = args.importance
    if args.tags:
        metadata["tags"] = [t.strip() for t in args.tags.split(",")]
    
    print("[ZK] Uploading encrypted blob + vector...", file=sys.stderr)
    
    # Build request payload
    payload = {
        "encryptedTitle": encrypted_title,
        "encryptedContent": encrypted_content,
        "vector": vector,
        "metadata": metadata,
    }
    if namespace:
        payload["namespace"] = namespace
    
    # Send only encrypted data + vector to server
    result = api_request("POST", "/api/v1/memories/zk", payload)
    
    ns_msg = f" [namespace: {namespace}]" if namespace else ""
    print(f"✓ Stored: {result.get('id', 'unknown')}{ns_msg}")
    print(f"  Server received: vector + encrypted blob (cannot read content)")


def cmd_search(args):
    """Search memories with zero-knowledge query."""
    _, _, vault_password, auto_namespace = get_config()
    
    # Handle namespace: --global ignores namespace, otherwise use arg or auto
    if getattr(args, 'all_namespaces', False):
        namespace = None
        print(f"[ZK] Searching ALL namespaces...", file=sys.stderr)
    else:
        namespace = getattr(args, 'namespace', None) or auto_namespace
        if namespace:
            print(f"[ZK] Searching namespace: {namespace}", file=sys.stderr)
    
    print(f"[ZK] Embedding query locally...", file=sys.stderr)
    
    # Embed query locally - server never sees search text
    vector = embed_local(args.query)
    
    print("[ZK] Searching by vector only...", file=sys.stderr)
    
    # Build search payload
    payload = {
        "vector": vector,
        "topK": args.limit,
    }
    if namespace:
        payload["namespace"] = namespace
    
    # Search using only the vector
    result = api_request("POST", "/api/v1/search/zk", payload)
    
    results = result.get("results", [])
    
    if not results:
        print("No memories found.")
        return
    
    print(f"\nFound {len(results)} results (decrypting locally):\n")
    
    for item in results:
        score = item.get("score", 0)
        mem_id = item.get("id", "?")
        
        # Decrypt locally
        try:
            title = decrypt_local(json.loads(item["encryptedTitle"]), vault_password)
            content = decrypt_local(json.loads(item["encryptedContent"]), vault_password)
            print(f"[{score:.0%}] {title}")
            print(f"  ID: {mem_id}")
            print(f"  {content[:200]}{'...' if len(content) > 200 else ''}")
            print()
        except Exception as e:
            # Might be a non-ZK memory or different vault password
            print(f"[{score:.0%}] [Cannot decrypt - different vault or plaintext memory]")
            print(f"  ID: {mem_id}")
            print()


def cmd_context(args):
    """Get relevant context for LLM prompt (zero-knowledge)."""
    _, _, vault_password, auto_namespace = get_config()
    
    # Handle namespace
    if getattr(args, 'all_namespaces', False):
        namespace = None
    else:
        namespace = getattr(args, 'namespace', None) or auto_namespace
    
    print(f"[ZK] Embedding query locally...", file=sys.stderr)
    vector = embed_local(args.query)
    
    print("[ZK] Fetching relevant memories...", file=sys.stderr)
    
    payload = {
        "vector": vector,
        "topK": args.max_results,
    }
    if namespace:
        payload["namespace"] = namespace
    
    result = api_request("POST", "/api/v1/search/zk", payload)
    
    results = result.get("results", [])
    
    if not results:
        return
    
    # Build context from decrypted memories
    context_parts = []
    for i, item in enumerate(results, 1):
        try:
            title = decrypt_local(json.loads(item["encryptedTitle"]), vault_password)
            content = decrypt_local(json.loads(item["encryptedContent"]), vault_password)
            score = item.get("score", 0)
            context_parts.append(f"[{i}] {title}\nRelevance: {score:.0%}\n{content}")
        except:
            pass  # Skip memories we can't decrypt
    
    if context_parts:
        print("\n---\n".join(context_parts))


def cmd_list(args):
    """List recent memories."""
    _, _, vault_password, auto_namespace = get_config()
    namespace = getattr(args, 'namespace', None) or auto_namespace
    
    # Build endpoint with namespace
    endpoint = f"/api/v1/memories?limit={args.limit}"
    if namespace:
        from urllib.parse import quote
        endpoint += f"&namespace={quote(namespace)}"
    
    result = api_request("GET", endpoint)
    memories = result.get("memories", [])
    
    if not memories:
        print("No memories found.")
        return
    
    for mem in memories:
        mem_id = mem.get("id", "?")
        created = mem.get("createdAt", "?")[:10]
        metadata = mem.get("metadata") or {}
        importance = metadata.get("importance", "-")
        is_zk = metadata.get("zk", False)
        
        # Try to decrypt title
        title = mem.get("title", "Untitled")
        if is_zk:
            try:
                title = decrypt_local(json.loads(title), vault_password)
                title = f"🔒 {title}"
            except:
                title = "🔒 [Encrypted - different vault]"
        
        print(f"[{importance}] {title}")
        print(f"    ID: {mem_id} | {created} | {'ZK' if is_zk else 'Plaintext'}")


def main():
    parser = argparse.ArgumentParser(
        description="MEMRY Zero-Knowledge CLI - Your data never leaves your device unencrypted",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Privacy Guarantees:
  • Embeddings generated locally (FastEmbed ONNX)
  • Content encrypted locally (AES-256-GCM)
  • Server only receives vectors + encrypted blobs
  • Server cannot read your memories or know what you search for

Examples:
  memry_zk.py store "User prefers morning meetings"
  memry_zk.py search "meeting preferences"
  memry_zk.py context "scheduling a meeting"
  memry_zk.py list --limit 5
        """
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # store
    store_p = subparsers.add_parser("store", help="Store a memory (encrypted locally)")
    store_p.add_argument("text", help="Memory content")
    store_p.add_argument("--title", help="Optional title")
    store_p.add_argument("--importance", type=int, choices=range(1, 11), metavar="1-10")
    store_p.add_argument("--tags", help="Comma-separated tags")
    store_p.add_argument("--namespace", "-n", help="Override auto-namespace")
    store_p.set_defaults(func=cmd_store)
    
    # search
    search_p = subparsers.add_parser("search", help="Search memories (query embedded locally)")
    search_p.add_argument("query", help="Search query")
    search_p.add_argument("--limit", type=int, default=5)
    search_p.add_argument("--namespace", "-n", help="Override auto-namespace")
    search_p.add_argument("--global", dest="all_namespaces", action="store_true", 
                          help="Search ALL namespaces")
    search_p.set_defaults(func=cmd_search)
    
    # context
    context_p = subparsers.add_parser("context", help="Get context for LLM")
    context_p.add_argument("query", help="Current task/query")
    context_p.add_argument("--max-results", type=int, default=5)
    context_p.add_argument("--namespace", "-n", help="Override auto-namespace")
    context_p.add_argument("--global", dest="all_namespaces", action="store_true",
                           help="Search ALL namespaces")
    context_p.set_defaults(func=cmd_context)
    
    # list
    list_p = subparsers.add_parser("list", help="List recent memories")
    list_p.add_argument("--limit", type=int, default=10)
    list_p.add_argument("--namespace", "-n", help="Override auto-namespace")
    list_p.set_defaults(func=cmd_list)
    
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
