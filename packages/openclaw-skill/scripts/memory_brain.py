#!/usr/bin/env python3
"""
Engrm Brain Functions

Advanced memory features:
- Decay: Memories fade if not accessed
- Consolidation: Merge similar memories into beliefs
- Contradiction detection: Catch conflicting memories
- Temporal awareness: "X days ago"
- Proactive recall: Auto-surface relevant context
- Confidence levels: Certainty of memories
- Memory versioning: Track preference changes
- Working memory: Short-term context that expires
"""

import hashlib
import json
import os
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from base64 import b64encode, b64decode

# =============================================================================
# Config
# =============================================================================

def get_config():
    """Load config from environment or secrets file."""
    api_key = os.environ.get("ENGRM_API_KEY")
    api_url = os.environ.get("ENGRM_API_URL", "https://engrm.xyz")
    vault_password = os.environ.get("ENGRM_VAULT_PASSWORD")
    namespace = (
        os.environ.get("ENGRM_NAMESPACE") or
        os.environ.get("ENGRM_CHAT_ID") or
        os.environ.get("ENGRM_SESSION_ID")
    )
    
    secrets_path = Path.home() / ".openclaw" / "secrets" / "engrm.env"
    if secrets_path.exists():
        for line in secrets_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, value = line.split("=", 1)
                value = value.strip().strip('"\'')
                if key == "ENGRM_API_KEY" and not api_key:
                    api_key = value
                elif key == "ENGRM_API_URL":
                    api_url = value
                elif key == "ENGRM_VAULT_PASSWORD" and not vault_password:
                    vault_password = value
                elif key == "ENGRM_NAMESPACE" and not namespace:
                    namespace = value
    
    return api_key, api_url.rstrip("/"), vault_password, namespace


def hash_namespace(namespace: str, vault_password: str) -> str:
    """Hash namespace using PBKDF2 for privacy."""
    if not namespace:
        return None
    key = hashlib.pbkdf2_hmac(
        'sha256',
        vault_password.encode('utf-8'),
        namespace.encode('utf-8'),
        iterations=100_000,
        dklen=16
    )
    return f"ns_{key.hex()}"


GLOBAL_NAMESPACE_RAW = "__global__"

def get_global_namespace(vault_password: str) -> str:
    return hash_namespace(GLOBAL_NAMESPACE_RAW, vault_password)


# =============================================================================
# Encryption (matching memry.py)
# =============================================================================

def encrypt_local(plaintext: str, password: str) -> dict:
    from Crypto.Cipher import AES
    from Crypto.Protocol.KDF import PBKDF2
    from Crypto.Hash import SHA256
    from Crypto.Random import get_random_bytes
    
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


def decrypt_local(encrypted: dict, password: str) -> str:
    from Crypto.Cipher import AES
    from Crypto.Protocol.KDF import PBKDF2
    from Crypto.Hash import SHA256
    
    salt = b64decode(encrypted["salt"])
    iv = b64decode(encrypted["iv"])
    tag = b64decode(encrypted["tag"])
    ciphertext = b64decode(encrypted["ciphertext"])
    
    key = PBKDF2(password.encode('utf-8'), salt, dkLen=32, count=100000, hmac_hash_module=SHA256)
    cipher = AES.new(key, AES.MODE_GCM, nonce=iv)
    plaintext = cipher.decrypt_and_verify(ciphertext, tag)
    return plaintext.decode('utf-8')


# =============================================================================
# Embedding
# =============================================================================

_embedder = None

def get_embedder():
    global _embedder
    if _embedder is None:
        from fastembed import TextEmbedding
        _embedder = TextEmbedding(
            model_name="sentence-transformers/all-MiniLM-L6-v2",
            cache_dir=str(Path.home() / ".cache" / "memry" / "models")
        )
    return _embedder


def embed_local(text: str) -> list:
    embedder = get_embedder()
    embeddings = list(embedder.embed([text[:512]]))
    return embeddings[0].tolist()


def cosine_similarity(a: list, b: list) -> float:
    """Calculate cosine similarity between two vectors."""
    if len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


# =============================================================================
# API Client
# =============================================================================

def api_request(method: str, endpoint: str, data: dict = None):
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
# TEMPORAL AWARENESS
# =============================================================================

def time_ago(timestamp: str) -> str:
    """Convert ISO timestamp to human-readable 'X ago' format."""
    try:
        dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        now = datetime.now(dt.tzinfo) if dt.tzinfo else datetime.now()
        delta = now - dt
        
        if delta.days > 365:
            years = delta.days // 365
            return f"{years} year{'s' if years > 1 else ''} ago"
        elif delta.days > 30:
            months = delta.days // 30
            return f"{months} month{'s' if months > 1 else ''} ago"
        elif delta.days > 0:
            return f"{delta.days} day{'s' if delta.days > 1 else ''} ago"
        elif delta.seconds > 3600:
            hours = delta.seconds // 3600
            return f"{hours} hour{'s' if hours > 1 else ''} ago"
        elif delta.seconds > 60:
            minutes = delta.seconds // 60
            return f"{minutes} minute{'s' if minutes > 1 else ''} ago"
        else:
            return "just now"
    except:
        return "unknown time"


# =============================================================================
# CONFIDENCE LEVELS
# =============================================================================

CONFIDENCE_PATTERNS = {
    "certain": (0.95, [
        r"\b(i definitely|i always|i never|absolutely|certainly|100%)\b",
        r"\b(my name is|i am|i live in|i work at)\b",
    ]),
    "high": (0.8, [
        r"\b(i usually|i generally|most of the time|typically)\b",
        r"\b(i prefer|i like|i want)\b",
    ]),
    "medium": (0.6, [
        r"\b(i think|i believe|probably|likely|often)\b",
        r"\b(seems like|appears to be)\b",
    ]),
    "low": (0.4, [
        r"\b(maybe|perhaps|might|could be|not sure)\b",
        r"\b(i guess|i suppose)\b",
    ]),
    "uncertain": (0.2, [
        r"\b(i don't know|no idea|uncertain|unclear)\b",
    ]),
}

def extract_confidence(text: str) -> Tuple[float, str]:
    """Extract confidence level from text."""
    text_lower = text.lower()
    
    for level, (score, patterns) in CONFIDENCE_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, text_lower):
                return score, level
    
    # Default to medium confidence
    return 0.6, "medium"


# =============================================================================
# CONTRADICTION DETECTION
# =============================================================================

PREFERENCE_PATTERNS = [
    (r"i (prefer|like|love|enjoy|want)\s+(.+?)(?:\.|$|,)", "positive"),
    (r"i (hate|dislike|don't like|avoid|can't stand)\s+(.+?)(?:\.|$|,)", "negative"),
    (r"i am\s+(.+?)(?:\.|$|,)", "identity"),
    (r"i live in\s+(.+?)(?:\.|$|,)", "location"),
    (r"i work (?:at|for)\s+(.+?)(?:\.|$|,)", "work"),
]

def extract_claims(text: str) -> List[Dict]:
    """Extract preference/identity claims from text."""
    claims = []
    text_lower = text.lower()
    
    for pattern, claim_type in PREFERENCE_PATTERNS:
        matches = re.findall(pattern, text_lower)
        for match in matches:
            if isinstance(match, tuple):
                verb, subject = match[0], match[1]
            else:
                subject = match
                verb = None
            claims.append({
                "type": claim_type,
                "subject": subject.strip(),
                "verb": verb,
                "full_text": text,
            })
    
    return claims


def find_contradictions(new_text: str, existing_memories: List[Dict], vault_password: str) -> List[Dict]:
    """Find memories that contradict the new text."""
    new_claims = extract_claims(new_text)
    if not new_claims:
        return []
    
    contradictions = []
    
    for memory in existing_memories:
        try:
            content = decrypt_local(json.loads(memory.get("encryptedContent", "{}")), vault_password)
            existing_claims = extract_claims(content)
            
            for new_claim in new_claims:
                for existing_claim in existing_claims:
                    # Same subject, different sentiment
                    if new_claim["subject"] == existing_claim["subject"]:
                        if new_claim["type"] != existing_claim["type"]:
                            contradictions.append({
                                "new": new_claim,
                                "existing": existing_claim,
                                "memory_id": memory.get("id"),
                                "existing_text": content,
                            })
        except:
            pass
    
    return contradictions


# =============================================================================
# MEMORY VERSIONING
# =============================================================================

def create_version_entry(old_content: str, new_content: str, reason: str = "updated") -> Dict:
    """Create a version history entry."""
    return {
        "timestamp": datetime.now().isoformat(),
        "old_value": old_content[:200],
        "new_value": new_content[:200],
        "reason": reason,
    }


# =============================================================================
# WORKING MEMORY (Short-term, expires)
# =============================================================================

WORKING_MEMORY_FILE = Path.home() / ".cache" / "memry" / "working_memory.json"
WORKING_MEMORY_TTL = 3600  # 1 hour

def load_working_memory() -> List[Dict]:
    """Load working memory, filtering expired entries."""
    if not WORKING_MEMORY_FILE.exists():
        return []
    
    try:
        data = json.loads(WORKING_MEMORY_FILE.read_text())
        now = datetime.now().timestamp()
        # Filter out expired entries
        valid = [m for m in data if m.get("expires_at", 0) > now]
        return valid
    except:
        return []


def save_working_memory(memories: List[Dict]):
    """Save working memory."""
    WORKING_MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    WORKING_MEMORY_FILE.write_text(json.dumps(memories, indent=2))


def add_to_working_memory(content: str, ttl_seconds: int = WORKING_MEMORY_TTL):
    """Add to working memory (short-term, expires)."""
    memories = load_working_memory()
    memories.append({
        "content": content,
        "created_at": datetime.now().isoformat(),
        "expires_at": datetime.now().timestamp() + ttl_seconds,
    })
    save_working_memory(memories)
    return len(memories)


def get_working_memory() -> List[Dict]:
    """Get current working memory."""
    return load_working_memory()


def clear_working_memory():
    """Clear all working memory."""
    save_working_memory([])


# =============================================================================
# DECAY & CONSOLIDATION (Dream Cycle)
# =============================================================================

def calculate_decay(
    base_strength: float,
    halflife_days: int,
    days_since_access: float,
    access_count: int
) -> float:
    """Calculate decayed strength using exponential decay with access boost."""
    import math
    
    # Exponential decay
    decay_factor = 0.5 ** (days_since_access / halflife_days)
    decayed = base_strength * decay_factor
    
    # Access count provides resistance to decay
    access_boost = 1 + (0.1 * min(access_count, 10))  # Max 2x boost
    
    return min(decayed * access_boost, base_strength)


def find_similar_memories(
    memories: List[Dict],
    vault_password: str,
    similarity_threshold: float = 0.85
) -> List[Tuple[Dict, Dict, float]]:
    """Find pairs of similar memories that could be consolidated."""
    similar_pairs = []
    
    # Get embeddings for all memories
    memory_embeddings = []
    for mem in memories:
        try:
            content = decrypt_local(json.loads(mem.get("encryptedContent", "{}")), vault_password)
            vector = embed_local(content)
            memory_embeddings.append((mem, content, vector))
        except:
            pass
    
    # Compare all pairs
    for i, (mem1, content1, vec1) in enumerate(memory_embeddings):
        for j, (mem2, content2, vec2) in enumerate(memory_embeddings[i+1:], i+1):
            sim = cosine_similarity(vec1, vec2)
            if sim >= similarity_threshold:
                similar_pairs.append((mem1, mem2, sim))
    
    return similar_pairs


def consolidate_memories(mem1_content: str, mem2_content: str) -> str:
    """Consolidate two similar memories into one stronger memory."""
    # Simple consolidation: combine key points
    # In production, could use LLM for smarter consolidation
    
    # If nearly identical, keep the longer one
    if len(mem1_content) > len(mem2_content):
        return mem1_content
    return mem2_content


def run_dream_cycle(namespace: str = None, dry_run: bool = True) -> Dict:
    """
    Run the dream cycle: decay old memories, consolidate similar ones.
    
    Returns stats about what was processed.
    """
    _, _, vault_password, auto_namespace = get_config()
    ns = hash_namespace(namespace or auto_namespace, vault_password) if (namespace or auto_namespace) else None
    
    print("[Dream] Starting dream cycle...", file=sys.stderr)
    
    stats = {
        "memories_checked": 0,
        "decayed": 0,
        "consolidated": 0,
        "archived": 0,
    }
    
    # Fetch memories
    endpoint = f"/api/v1/memories?limit=100"
    if ns:
        from urllib.parse import quote
        endpoint += f"&namespace={quote(ns)}"
    
    result = api_request("GET", endpoint)
    memories = result.get("memories", []) if result else []
    stats["memories_checked"] = len(memories)
    
    print(f"[Dream] Checking {len(memories)} memories...", file=sys.stderr)
    
    # Find similar memories for consolidation
    similar = find_similar_memories(memories, vault_password)
    stats["consolidation_candidates"] = len(similar)
    
    if similar:
        print(f"[Dream] Found {len(similar)} consolidation candidates", file=sys.stderr)
        for mem1, mem2, sim in similar[:5]:  # Show top 5
            try:
                content1 = decrypt_local(json.loads(mem1.get("encryptedContent", "{}")), vault_password)
                content2 = decrypt_local(json.loads(mem2.get("encryptedContent", "{}")), vault_password)
                print(f"  [{sim:.0%}] '{content1[:50]}...' ≈ '{content2[:50]}...'", file=sys.stderr)
            except:
                pass
    
    if dry_run:
        print("[Dream] Dry run - no changes made", file=sys.stderr)
    else:
        # TODO: Implement actual consolidation via API
        print("[Dream] Consolidation not yet implemented in API", file=sys.stderr)
    
    return stats


# =============================================================================
# PROACTIVE RECALL
# =============================================================================

def proactive_recall(
    current_context: str,
    max_results: int = 3,
    min_relevance: float = 0.6
) -> List[Dict]:
    """
    Proactively recall relevant memories based on current context.
    Use this to auto-inject context without explicit search.
    
    Returns list of relevant memories with temporal context.
    """
    _, _, vault_password, auto_namespace = get_config()
    
    # Embed current context
    vector = embed_local(current_context)
    
    results = []
    seen_ids = set()
    
    # Search chat namespace
    if auto_namespace:
        chat_ns = hash_namespace(auto_namespace, vault_password)
        result = api_request("POST", "/api/v1/search/zk", {
            "vector": vector,
            "topK": max_results * 2,
            "namespace": chat_ns,
        })
        for r in result.get("results", []) if result else []:
            if r.get("score", 0) >= min_relevance:
                r["_source"] = "chat"
                results.append(r)
                seen_ids.add(r.get("id"))
    
    # Search global namespace
    global_ns = get_global_namespace(vault_password)
    result = api_request("POST", "/api/v1/search/zk", {
        "vector": vector,
        "topK": max_results * 2,
        "namespace": global_ns,
    })
    for r in result.get("results", []) if result else []:
        if r.get("id") not in seen_ids and r.get("score", 0) >= min_relevance:
            r["_source"] = "global"
            results.append(r)
    
    # Sort by relevance and limit
    results.sort(key=lambda x: x.get("score", 0), reverse=True)
    results = results[:max_results]
    
    # Enrich with temporal context and decrypted content
    enriched = []
    for r in results:
        try:
            content = decrypt_local(json.loads(r.get("encryptedContent", "{}")), vault_password)
            title = decrypt_local(json.loads(r.get("encryptedTitle", "{}")), vault_password)
            
            enriched.append({
                "id": r.get("id"),
                "title": title,
                "content": content,
                "relevance": r.get("score", 0),
                "source": r.get("_source", "unknown"),
                "when": time_ago(r.get("createdAt", "")),
                "created_at": r.get("createdAt"),
            })
        except:
            pass
    
    return enriched


def format_proactive_context(memories: List[Dict]) -> str:
    """Format proactive recall results for injection into prompt."""
    if not memories:
        return ""
    
    lines = ["[Relevant memories:]"]
    for m in memories:
        source_icon = "🧠" if m["source"] == "global" else "💬"
        lines.append(f"{source_icon} ({m['when']}) {m['title']}: {m['content'][:150]}...")
    
    return "\n".join(lines)


# =============================================================================
# SMART STORE (with all features)
# =============================================================================

def smart_store(
    content: str,
    title: str = None,
    namespace: str = None,
    check_contradictions: bool = True,
    auto_global: bool = True,
) -> Dict:
    """
    Smart store with all brain features:
    - Confidence extraction
    - Contradiction detection
    - Auto-global for identity
    - Memory versioning
    """
    _, _, vault_password, auto_namespace = get_config()
    
    result = {
        "stored": False,
        "memory_id": None,
        "confidence": None,
        "contradictions": [],
        "is_global": False,
        "warnings": [],
    }
    
    # Extract confidence
    confidence_score, confidence_level = extract_confidence(content)
    result["confidence"] = {"score": confidence_score, "level": confidence_level}
    
    # Check for contradictions
    if check_contradictions:
        # Search for potentially conflicting memories
        vector = embed_local(content)
        search_result = api_request("POST", "/api/v1/search/zk", {
            "vector": vector,
            "topK": 10,
        })
        existing = search_result.get("results", []) if search_result else []
        
        contradictions = find_contradictions(content, existing, vault_password)
        if contradictions:
            result["contradictions"] = contradictions
            result["warnings"].append(
                f"Found {len(contradictions)} potential contradiction(s) with existing memories"
            )
    
    # Check if identity memory
    from engrm import is_identity_memory  # Import from main module
    is_identity = is_identity_memory(content)
    
    # Prepare metadata
    metadata = {
        "zk": True,
        "confidence": confidence_score,
        "confidence_level": confidence_level,
    }
    
    if is_identity:
        metadata["memory_type"] = "identity"
        result["is_global"] = True
    
    # Encrypt
    title = title or content[:100]
    encrypted_title = json.dumps(encrypt_local(title, vault_password))
    encrypted_content = json.dumps(encrypt_local(content, vault_password))
    vector = embed_local(content)
    
    # Store in chat namespace
    ns = hash_namespace(namespace or auto_namespace, vault_password) if (namespace or auto_namespace) else None
    if ns:
        api_result = api_request("POST", "/api/v1/memories/zk", {
            "encryptedTitle": encrypted_title,
            "encryptedContent": encrypted_content,
            "vector": vector,
            "metadata": metadata,
            "namespace": ns,
        })
        if api_result:
            result["stored"] = True
            result["memory_id"] = api_result.get("id")
    
    # Also store in global if identity
    if is_identity and auto_global:
        global_ns = get_global_namespace(vault_password)
        global_metadata = {**metadata, "global": True}
        api_request("POST", "/api/v1/memories/zk", {
            "encryptedTitle": encrypted_title,
            "encryptedContent": encrypted_content,
            "vector": vector,
            "metadata": global_metadata,
            "namespace": global_ns,
        })
    
    return result


# =============================================================================
# CLI
# =============================================================================

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Engrm Brain Functions")
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # dream cycle
    dream_p = subparsers.add_parser("dream", help="Run dream cycle (decay + consolidation)")
    dream_p.add_argument("--namespace", "-n", help="Namespace to process")
    dream_p.add_argument("--apply", action="store_true", help="Apply changes (default: dry run)")
    
    # proactive recall
    recall_p = subparsers.add_parser("recall", help="Proactive recall for context")
    recall_p.add_argument("context", help="Current context/topic")
    recall_p.add_argument("--limit", type=int, default=3)
    recall_p.add_argument("--min-relevance", type=float, default=0.6)
    
    # working memory
    wm_p = subparsers.add_parser("working", help="Working memory (short-term)")
    wm_sub = wm_p.add_subparsers(dest="wm_action", required=True)
    wm_add = wm_sub.add_parser("add", help="Add to working memory")
    wm_add.add_argument("content", help="Content to remember temporarily")
    wm_add.add_argument("--ttl", type=int, default=3600, help="TTL in seconds")
    wm_sub.add_parser("list", help="List working memory")
    wm_sub.add_parser("clear", help="Clear working memory")
    
    # smart store
    store_p = subparsers.add_parser("smart-store", help="Smart store with brain features")
    store_p.add_argument("content", help="Content to store")
    store_p.add_argument("--title", help="Optional title")
    store_p.add_argument("--no-contradiction-check", action="store_true")
    
    args = parser.parse_args()
    
    if args.command == "dream":
        stats = run_dream_cycle(args.namespace, dry_run=not args.apply)
        print(json.dumps(stats, indent=2))
    
    elif args.command == "recall":
        memories = proactive_recall(args.context, args.limit, args.min_relevance)
        if memories:
            print(format_proactive_context(memories))
        else:
            print("No relevant memories found.")
    
    elif args.command == "working":
        if args.wm_action == "add":
            count = add_to_working_memory(args.content, args.ttl)
            print(f"Added to working memory ({count} items total)")
        elif args.wm_action == "list":
            memories = get_working_memory()
            if memories:
                for i, m in enumerate(memories, 1):
                    expires = datetime.fromtimestamp(m["expires_at"])
                    print(f"[{i}] {m['content'][:80]}... (expires: {expires})")
            else:
                print("Working memory is empty")
        elif args.wm_action == "clear":
            clear_working_memory()
            print("Working memory cleared")
    
    elif args.command == "smart-store":
        result = smart_store(
            args.content,
            title=args.title,
            check_contradictions=not args.no_contradiction_check,
        )
        print(json.dumps(result, indent=2, default=str))
