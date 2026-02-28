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
import hashlib
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


def hash_namespace(namespace: str, vault_password: str) -> str:
    """
    Hash namespace with vault password for zero-knowledge.
    Server sees opaque ID, can't know the actual chat/project name.
    
    Uses first 16 chars of SHA256(namespace + password) for readability.
    Deterministic: same input always produces same hash.
    """
    if not namespace:
        return None
    combined = f"{namespace}:{vault_password}"
    hash_bytes = hashlib.sha256(combined.encode('utf-8')).hexdigest()
    return f"ns_{hash_bytes[:16]}"  # e.g., "ns_a3f2b8c1d4e5f6a7"


# Global namespace constant (hashed with password at runtime)
GLOBAL_NAMESPACE_RAW = "__global__"

def get_global_namespace(vault_password: str) -> str:
    """Get the hashed global namespace for identity/preferences."""
    return hash_namespace(GLOBAL_NAMESPACE_RAW, vault_password)


# Patterns that indicate identity/global memories
IDENTITY_PATTERNS = [
    r"\b(i am|i'm|my name is)\b",
    r"\b(i live|i'm from|i'm based)\b", 
    r"\b(i work at|i work for|my job|my role)\b",
    r"\b(i prefer|i like|i hate|i always|i never)\b",
    r"\b(i'm allergic|i can't eat|i don't eat)\b",
    r"\b(my email|my phone|my address)\b",
    r"\b(my wife|my husband|my partner|my kids)\b",
]

def is_identity_memory(text: str) -> bool:
    """Check if text contains identity/preference patterns that should be global."""
    import re
    text_lower = text.lower()
    for pattern in IDENTITY_PATTERNS:
        if re.search(pattern, text_lower):
            return True
    return False


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
    raw_namespace = getattr(args, 'namespace', None) or auto_namespace
    force_global = getattr(args, 'global_store', False)
    
    # Check if this is an identity/preference memory that should be global
    is_identity = is_identity_memory(args.text)
    store_global = force_global or is_identity
    
    # Hash namespace for zero-knowledge (server can't see actual chat name)
    namespace = hash_namespace(raw_namespace, vault_password) if raw_namespace else None
    global_ns = get_global_namespace(vault_password)
    
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
    if is_identity:
        metadata["memory_type"] = "identity"
    
    print("[ZK] Uploading encrypted blob + vector...", file=sys.stderr)
    
    stored_ids = []
    
    # Store in chat namespace (unless --global-only)
    if namespace and not getattr(args, 'global_only', False):
        payload = {
            "encryptedTitle": encrypted_title,
            "encryptedContent": encrypted_content,
            "vector": vector,
            "metadata": metadata,
            "namespace": namespace,
        }
        result = api_request("POST", "/api/v1/memories/zk", payload)
        if result:
            stored_ids.append(f"chat:{result.get('id', '?')}")
    
    # Also store in global namespace for identity/preferences
    if store_global:
        global_metadata = {**metadata, "global": True}
        payload = {
            "encryptedTitle": encrypted_title,
            "encryptedContent": encrypted_content,
            "vector": vector,
            "metadata": global_metadata,
            "namespace": global_ns,
        }
        result = api_request("POST", "/api/v1/memories/zk", payload)
        if result:
            stored_ids.append(f"global:{result.get('id', '?')}")
    
    # Output
    if is_identity and not force_global:
        print(f"✓ Detected identity memory → stored globally + chat", file=sys.stderr)
    
    print(f"✓ Stored: {', '.join(stored_ids)}")
    print(f"  Server received: vector + encrypted blob (cannot read content)")


def cmd_search(args):
    """Search memories with zero-knowledge query. Uses layered search: chat + global."""
    _, _, vault_password, auto_namespace = get_config()
    
    print(f"[ZK] Embedding query locally...", file=sys.stderr)
    
    # Embed query locally - server never sees search text
    vector = embed_local(args.query)
    
    all_results = []
    
    # Handle namespace: --global searches everything, otherwise layered search
    if getattr(args, 'all_namespaces', False):
        print(f"[ZK] Searching ALL namespaces...", file=sys.stderr)
        result = api_request("POST", "/api/v1/search/zk", {
            "vector": vector,
            "topK": args.limit,
        })
        all_results = result.get("results", [])
    else:
        # Layered search: current chat + global (like a brain)
        raw_namespace = getattr(args, 'namespace', None) or auto_namespace
        chat_ns = hash_namespace(raw_namespace, vault_password) if raw_namespace else None
        global_ns = get_global_namespace(vault_password)
        
        print(f"[ZK] Layered search: chat + global identity...", file=sys.stderr)
        
        seen_ids = set()
        
        # Search chat namespace
        if chat_ns:
            result = api_request("POST", "/api/v1/search/zk", {
                "vector": vector,
                "topK": args.limit,
                "namespace": chat_ns,
            })
            for r in result.get("results", []):
                r["_source"] = "chat"
                r["_boost"] = 1.1  # Boost current context
                all_results.append(r)
                seen_ids.add(r.get("id"))
        
        # Search global namespace (identity/preferences)
        result = api_request("POST", "/api/v1/search/zk", {
            "vector": vector,
            "topK": args.limit,
            "namespace": global_ns,
        })
        for r in result.get("results", []):
            if r.get("id") not in seen_ids:
                r["_source"] = "global"
                r["_boost"] = 1.0
                all_results.append(r)
        
        # Sort by boosted score
        all_results.sort(key=lambda x: x.get("score", 0) * x.get("_boost", 1), reverse=True)
        all_results = all_results[:args.limit]
    
    if not all_results:
        print("No memories found.")
        return
    
    print(f"\nFound {len(all_results)} results (decrypting locally):\n")
    
    for item in all_results:
        score = item.get("score", 0)
        boost = item.get("_boost", 1)
        source = item.get("_source", "?")
        mem_id = item.get("id", "?")
        
        # Source indicator
        source_icon = "🧠" if source == "global" else "💬"
        
        # Decrypt locally
        try:
            title = decrypt_local(json.loads(item["encryptedTitle"]), vault_password)
            content = decrypt_local(json.loads(item["encryptedContent"]), vault_password)
            print(f"{source_icon} [{score:.0%}] {title}")
            print(f"  ID: {mem_id}")
            print(f"  {content[:200]}{'...' if len(content) > 200 else ''}")
            print()
        except Exception as e:
            # Might be a non-ZK memory or different vault password
            print(f"{source_icon} [{score:.0%}] [Cannot decrypt - different vault or plaintext memory]")
            print(f"  ID: {mem_id}")
            print()


def cmd_context(args):
    """Get relevant context for LLM prompt (zero-knowledge). Uses layered search."""
    _, _, vault_password, auto_namespace = get_config()
    
    print(f"[ZK] Embedding query locally...", file=sys.stderr)
    vector = embed_local(args.query)
    
    all_results = []
    
    # Handle namespace: --global searches everything, otherwise layered search
    if getattr(args, 'all_namespaces', False):
        print("[ZK] Fetching from ALL namespaces...", file=sys.stderr)
        result = api_request("POST", "/api/v1/search/zk", {
            "vector": vector,
            "topK": args.max_results,
        })
        all_results = result.get("results", [])
    else:
        # Layered search: current chat + global identity
        raw_namespace = getattr(args, 'namespace', None) or auto_namespace
        chat_ns = hash_namespace(raw_namespace, vault_password) if raw_namespace else None
        global_ns = get_global_namespace(vault_password)
        
        print("[ZK] Fetching from chat + global identity...", file=sys.stderr)
        
        seen_ids = set()
        
        # Search chat namespace
        if chat_ns:
            result = api_request("POST", "/api/v1/search/zk", {
                "vector": vector,
                "topK": args.max_results,
                "namespace": chat_ns,
            })
            for r in result.get("results", []):
                r["_source"] = "chat"
                all_results.append(r)
                seen_ids.add(r.get("id"))
        
        # Search global namespace
        result = api_request("POST", "/api/v1/search/zk", {
            "vector": vector,
            "topK": args.max_results,
            "namespace": global_ns,
        })
        for r in result.get("results", []):
            if r.get("id") not in seen_ids:
                r["_source"] = "global"
                all_results.append(r)
        
        # Sort by score and limit
        all_results.sort(key=lambda x: x.get("score", 0), reverse=True)
        all_results = all_results[:args.max_results]
    
    if not all_results:
        return
    
    # Build context from decrypted memories
    context_parts = []
    for i, item in enumerate(all_results, 1):
        try:
            title = decrypt_local(json.loads(item["encryptedTitle"]), vault_password)
            content = decrypt_local(json.loads(item["encryptedContent"]), vault_password)
            score = item.get("score", 0)
            source = item.get("_source", "")
            source_tag = " [identity]" if source == "global" else ""
            context_parts.append(f"[{i}] {title}{source_tag}\nRelevance: {score:.0%}\n{content}")
        except:
            pass  # Skip memories we can't decrypt
    
    if context_parts:
        print("\n---\n".join(context_parts))


def cmd_list(args):
    """List recent memories."""
    _, _, vault_password, auto_namespace = get_config()
    raw_namespace = getattr(args, 'namespace', None) or auto_namespace
    
    # Hash namespace for zero-knowledge
    namespace = hash_namespace(raw_namespace, vault_password) if raw_namespace else None
    
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
    store_p.add_argument("--global-store", "-g", action="store_true",
                         help="Store in global namespace (available everywhere)")
    store_p.add_argument("--global-only", action="store_true",
                         help="Store ONLY in global namespace (not in chat)")
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
