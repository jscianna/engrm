#!/usr/bin/env python3
"""
MEMRY Auto-Extraction

Automatically extracts and stores memories from conversation context.
Integrates with OpenClaw via stdin/stdout.

Usage:
    # Extract from JSON conversation
    echo '{"messages": [...]}' | python auto_extract.py
    
    # Extract from single message
    python auto_extract.py --text "User prefers dark themes and morning meetings"
    
    # Dry run (score only, don't store)
    python auto_extract.py --text "..." --dry-run
"""

import argparse
import json
import sys
import os
from typing import List, Dict, Optional
from pathlib import Path

# Add scripts dir to path for local imports
sys.path.insert(0, str(Path(__file__).parent))

from heuristics import (
    score_memory,
    extract_memories_from_conversation,
    ScoringResult,
    STORAGE_THRESHOLD,
    TYPE_HALFLIVES,
)

# =============================================================================
# Config
# =============================================================================

def get_config():
    """Load config from environment or secrets file."""
    api_key = os.environ.get("MEMRY_API_KEY")
    api_url = os.environ.get("MEMRY_API_URL", "https://memry-sand.vercel.app")
    vault_password = os.environ.get("MEMRY_VAULT_PASSWORD")
    
    # Auto-namespace: MEMRY_NAMESPACE > MEMRY_CHAT_ID > MEMRY_SESSION_ID
    namespace = (
        os.environ.get("MEMRY_NAMESPACE") or
        os.environ.get("MEMRY_CHAT_ID") or
        os.environ.get("MEMRY_SESSION_ID")
    )
    
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
                elif key == "MEMRY_API_URL":
                    api_url = value
                elif key == "MEMRY_VAULT_PASSWORD" and not vault_password:
                    vault_password = value
                elif key == "MEMRY_NAMESPACE" and not namespace:
                    namespace = value
    
    return api_key, api_url.rstrip("/"), vault_password, namespace


# =============================================================================
# Embedding & Encryption (lazy loaded)
# =============================================================================

_embedder = None

def get_embedder():
    """Lazy load FastEmbed."""
    global _embedder
    if _embedder is None:
        try:
            from fastembed import TextEmbedding
        except ImportError:
            print("Error: fastembed not installed. Run: pip install fastembed", file=sys.stderr)
            return None
        
        _embedder = TextEmbedding(
            model_name="sentence-transformers/all-MiniLM-L6-v2",
            cache_dir=str(Path.home() / ".cache" / "memry" / "models")
        )
    return _embedder


def embed_local(text: str) -> Optional[List[float]]:
    """Embed text locally."""
    embedder = get_embedder()
    if embedder is None:
        return None
    truncated = text[:512]
    embeddings = list(embedder.embed([truncated]))
    return embeddings[0].tolist()


def encrypt_local(plaintext: str, password: str) -> dict:
    """Encrypt text locally with AES-256-GCM."""
    try:
        from Crypto.Cipher import AES
        from Crypto.Protocol.KDF import PBKDF2
        from Crypto.Hash import SHA256
        from Crypto.Random import get_random_bytes
        from base64 import b64encode
    except ImportError:
        print("Error: pycryptodome not installed. Run: pip install pycryptodome", file=sys.stderr)
        return None
    
    salt = get_random_bytes(16)
    iv = get_random_bytes(12)
    
    key = PBKDF2(password.encode('utf-8'), salt, dkLen=32, count=100000, hmac_hash_module=SHA256)
    cipher = AES.new(key, AES.MODE_GCM, nonce=iv)
    ciphertext, tag = cipher.encrypt_and_digest(plaintext.encode('utf-8'))
    
    return {
        "ciphertext": b64encode(ciphertext).decode('ascii'),
        "iv": b64encode(iv).decode('ascii'),
        "tag": b64encode(tag).decode('ascii'),
        "salt": b64encode(salt).decode('ascii'),
    }


# =============================================================================
# API Client
# =============================================================================

def api_request(method: str, endpoint: str, data: dict = None):
    """Make authenticated API request."""
    from urllib.request import Request, urlopen
    from urllib.error import HTTPError, URLError
    
    api_key, api_url, _, _ = get_config()
    if not api_key:
        return None
    
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
    except (HTTPError, URLError) as e:
        print(f"API Error: {e}", file=sys.stderr)
        return None


# =============================================================================
# Auto-Extraction Logic
# =============================================================================

def process_single_text(
    text: str,
    dry_run: bool = False,
    namespace: str = None,
    session_id: str = None,
    conversation_id: str = None,
) -> Dict:
    """
    Process a single text for memory extraction.
    
    Returns dict with scoring result and storage outcome.
    """
    result = score_memory(text)
    
    output = {
        "text": text[:100] + "..." if len(text) > 100 else text,
        "score": result.score,
        "type": result.memory_type,
        "should_store": result.should_store,
        "signals": result.signals,
        "entities": result.entities,
        "stored": False,
        "memory_id": None,
    }
    
    if not result.should_store:
        output["reason"] = f"Score {result.score} below threshold {STORAGE_THRESHOLD}"
        return output
    
    if dry_run:
        output["reason"] = "Dry run - not stored"
        return output
    
    # Store the memory
    api_key, _, vault_password, auto_namespace = get_config()
    if not api_key or not vault_password:
        output["reason"] = "Missing API key or vault password"
        return output
    
    # Use provided namespace or fall back to auto-namespace
    namespace = namespace or auto_namespace
    
    # Encrypt and embed locally
    title = text[:100]
    encrypted_title = json.dumps(encrypt_local(title, vault_password))
    encrypted_content = json.dumps(encrypt_local(text, vault_password))
    vector = embed_local(text)
    
    if vector is None:
        output["reason"] = "Failed to generate embedding"
        return output
    
    # Build metadata
    metadata = {
        "zk": True,
        "importance": round(result.score),
        "memory_type": result.memory_type,
        "halflife_days": TYPE_HALFLIVES.get(result.memory_type, 60),
        "signals": result.signals,
        "entities": result.entities,
        "source": "auto_extract",
    }
    
    # Store via ZK endpoint
    api_result = api_request("POST", "/api/v1/memories/zk", {
        "encryptedTitle": encrypted_title,
        "encryptedContent": encrypted_content,
        "vector": vector,
        "metadata": metadata,
        "namespace": namespace,
        "sessionId": session_id,
        "conversationId": conversation_id,
    })
    
    if api_result and api_result.get("id"):
        output["stored"] = True
        output["memory_id"] = api_result["id"]
        output["action"] = api_result.get("action", "created")
    else:
        output["reason"] = "API request failed"
    
    return output


def process_conversation(
    messages: List[Dict[str, str]],
    dry_run: bool = False,
    namespace: str = None,
    session_id: str = None,
    conversation_id: str = None,
    window_size: int = 10,
) -> Dict:
    """
    Process a conversation for memory extraction.
    
    Returns summary of extracted memories.
    """
    extracted = extract_memories_from_conversation(messages, window_size)
    
    results = []
    stored_count = 0
    
    for mem in extracted:
        result = process_single_text(
            mem.content,
            dry_run=dry_run,
            namespace=namespace,
            session_id=session_id,
            conversation_id=conversation_id,
        )
        results.append(result)
        if result.get("stored"):
            stored_count += 1
    
    return {
        "total_messages": len(messages),
        "window_size": window_size,
        "candidates_found": len(extracted),
        "memories_stored": stored_count,
        "dry_run": dry_run,
        "results": results,
    }


# =============================================================================
# CLI
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="MEMRY Auto-Extraction - Extract memories from conversations",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Score and store a single memory
  python auto_extract.py --text "User prefers dark themes"
  
  # Dry run (score only)
  python auto_extract.py --text "..." --dry-run
  
  # Process conversation from stdin
  echo '{"messages": [{"role": "user", "content": "My name is John"}]}' | python auto_extract.py
  
  # Process with namespace
  python auto_extract.py --text "..." --namespace "personal"
        """
    )
    
    parser.add_argument("--text", "-t", help="Single text to process")
    parser.add_argument("--dry-run", "-n", action="store_true", help="Score only, don't store")
    parser.add_argument("--namespace", help="Namespace/project for organization")
    parser.add_argument("--session-id", help="Session ID for grouping")
    parser.add_argument("--conversation-id", help="Conversation ID for tracking")
    parser.add_argument("--window", type=int, default=10, help="Window size for conversation extraction")
    parser.add_argument("--json", "-j", action="store_true", help="Output as JSON")
    parser.add_argument("--quiet", "-q", action="store_true", help="Minimal output")
    
    args = parser.parse_args()
    
    # Single text mode
    if args.text:
        result = process_single_text(
            args.text,
            dry_run=args.dry_run,
            namespace=args.namespace,
            session_id=args.session_id,
            conversation_id=args.conversation_id,
        )
        
        if args.json:
            print(json.dumps(result, indent=2))
        elif args.quiet:
            if result.get("stored"):
                print(f"✓ Stored: {result.get('memory_id')}")
            elif result.get("should_store"):
                print(f"⏸ Would store (score: {result['score']})")
            else:
                print(f"✗ Below threshold (score: {result['score']})")
        else:
            print(f"Score: {result['score']}")
            print(f"Type: {result['type']}")
            print(f"Should store: {result['should_store']}")
            print(f"Signals: {', '.join(result['signals']) or 'none'}")
            if result.get("stored"):
                print(f"✓ Stored: {result['memory_id']} ({result.get('action', 'created')})")
            elif result.get("reason"):
                print(f"Note: {result['reason']}")
        
        return
    
    # Conversation mode (from stdin)
    if not sys.stdin.isatty():
        try:
            data = json.load(sys.stdin)
        except json.JSONDecodeError as e:
            print(f"Error: Invalid JSON input - {e}", file=sys.stderr)
            sys.exit(1)
        
        messages = data.get("messages", [])
        if not messages:
            print("Error: No messages found in input", file=sys.stderr)
            sys.exit(1)
        
        result = process_conversation(
            messages,
            dry_run=args.dry_run,
            namespace=args.namespace,
            session_id=args.session_id,
            conversation_id=args.conversation_id,
            window_size=args.window,
        )
        
        if args.json:
            print(json.dumps(result, indent=2))
        elif args.quiet:
            print(f"Extracted: {result['candidates_found']}, Stored: {result['memories_stored']}")
        else:
            print(f"Messages processed: {result['total_messages']} (window: {result['window_size']})")
            print(f"Candidates found: {result['candidates_found']}")
            print(f"Memories stored: {result['memories_stored']}")
            if result['dry_run']:
                print("(Dry run - nothing actually stored)")
            print()
            for r in result['results']:
                status = "✓" if r.get("stored") else ("⏸" if r.get("should_store") else "✗")
                print(f"{status} [{r['score']:.1f}] {r['type']}: {r['text']}")
        
        return
    
    # No input
    parser.print_help()


if __name__ == "__main__":
    main()
