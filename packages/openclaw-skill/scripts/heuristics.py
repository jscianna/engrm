#!/usr/bin/env python3
"""
MEMRY Heuristics Engine (Python port)

Scores memory importance using deterministic heuristics - no LLM required.
Matches the TypeScript implementation in src/lib/memory-heuristics.ts
"""

import re
from dataclasses import dataclass, field
from typing import List, Dict, Tuple, Optional

# =============================================================================
# Constants
# =============================================================================

STORAGE_THRESHOLD = 6.0

# Type multipliers
TYPE_MULTIPLIERS = {
    "constraint": 1.3,
    "identity": 1.2,
    "relationship": 1.1,
    "preference": 1.0,
    "how_to": 1.0,
    "fact": 0.9,
    "event": 0.8,
}

# Type halflives (days)
TYPE_HALFLIVES = {
    "constraint": 180,
    "how_to": 120,
    "identity": 120,
    "fact": 90,
    "preference": 60,
    "relationship": 30,
    "event": 14,
}

# =============================================================================
# Pattern Definitions
# =============================================================================

# Explicit memory markers (+3.0)
EXPLICIT_PATTERNS = [
    re.compile(r"\b(remember|don't forget|note this|important|keep in mind)\b", re.I),
    re.compile(r"\b(my name is|I work at|I'm a|I have a?|my \w+ is)\b", re.I),
    re.compile(r"\b(I (?:love|hate|prefer|always|never))\b", re.I),
    re.compile(r"\b(here's how|the steps are|to fix this|the way to)\b", re.I),
]

# Decision markers (+2.0)
DECISION_PATTERNS = [
    (re.compile(r"\b(decided|chose|committed|going with|booked|ordered|picked)\b", re.I), 1.0),
    (re.compile(r"\b(will|going to|must|need to|have to)\b", re.I), 0.5),
    (re.compile(r"\b(finally|at last|resolved|settled on)\b", re.I), 0.5),
]

# Correction markers (+1.5)
CORRECTION_PATTERNS = [
    re.compile(r"\b(actually|no wait|I meant|correction|sorry,? I meant)\b", re.I),
    re.compile(r"\b(not .{1,30},? but)\b", re.I),
]

# Temporal patterns
TEMPORAL_PATTERNS = {
    "absolute": (re.compile(r"\b(\d{4}-\d{2}-\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)\b", re.I), 0.8),
    "relative": (re.compile(r"\b(next|last|this)\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|week|month|year)\b", re.I), 0.5),
    "cyclical": (re.compile(r"\b(every|daily|weekly|monthly|annually|each morning|each day)\b", re.I), 0.7),
}

# Causal markers (+1.0)
CAUSAL_PATTERNS = [
    re.compile(r"\b(because|therefore|so that|in order to|as a result|this means|which is why)\b", re.I),
]

# Completion markers
COMPLETION_PATTERNS = [
    (re.compile(r"\b(done|finished|completed|shipped|deployed|launched|released)\b", re.I), 1.0),
    (re.compile(r"[✓✅☑️]", re.U), 1.0),
    (re.compile(r"\b(failed|error|didn't work|broken|bug)\b", re.I), 0.8),
]

# High arousal words for emotional intensity
HIGH_AROUSAL_WORDS = [
    "amazing", "incredible", "awesome", "fantastic", "wonderful",
    "terrible", "horrible", "awful", "disaster", "nightmare",
    "love", "hate", "obsessed", "perfect", "worst", "best",
    "crucial", "critical", "urgent", "essential", "vital",
]

# Safety keywords (always boost constraints)
SAFETY_KEYWORDS = [
    "allergic", "allergy", "emergency", "diabetic", "diabetes",
    "medication", "epipen", "blood type", "medical", "condition",
    "cannot eat", "deadly", "fatal", "life-threatening",
]

# =============================================================================
# Type Detection Patterns
# =============================================================================

TYPE_PATTERNS = {
    "constraint": [
        re.compile(r"\b(cannot|can't|must not|mustn't|never|forbidden|prohibited)\b", re.I),
        re.compile(r"\b(allergic|allergy|intolerant|sensitive to)\b", re.I),
        re.compile(r"\b(deadline|due by|expires?|must be done by)\b", re.I),
        re.compile(r"\b(limit|maximum|minimum|no more than|at least)\b", re.I),
    ],
    "identity": [
        re.compile(r"\b(I am|I'm a?|my name is|I work (?:at|for|as))\b", re.I),
        re.compile(r"\b(my (?:job|role|title|profession) is)\b", re.I),
        re.compile(r"\b(I (?:was born|grew up|live|am from))\b", re.I),
        re.compile(r"\b(my background is|I specialize in)\b", re.I),
    ],
    "relationship": [
        re.compile(r"\b(my (?:friend|colleague|partner|wife|husband|boss|mentor|team))\b", re.I),
        re.compile(r"\b(I (?:work with|report to|manage|know|met))\b", re.I),
        re.compile(r"\b((?:he|she|they) (?:is|are) my)\b", re.I),
    ],
    "preference": [
        re.compile(r"\b(I (?:prefer|like|love|enjoy|hate|dislike|avoid))\b", re.I),
        re.compile(r"\b(my (?:favorite|preferred|go-to))\b", re.I),
        re.compile(r"\b(I (?:always|usually|never|rarely))\b", re.I),
    ],
    "how_to": [
        re.compile(r"\b(how to|here's how|the (?:steps|process|way) (?:is|are|to))\b", re.I),
        re.compile(r"\b(to (?:fix|solve|do|make|create|build) (?:this|it|a))\b", re.I),
        re.compile(r"\b((?:first|then|next|finally),? (?:you|we|I))\b", re.I),
        re.compile(r"\b(step \d|1\.|2\.|3\.)\b", re.I),
    ],
    "fact": [
        re.compile(r"\b(is (?:located|based|found) (?:in|at))\b", re.I),
        re.compile(r"\b((?:the|a) .{1,20} (?:is|are|has|have|was|were))\b", re.I),
        re.compile(r"\b(means|refers to|is defined as)\b", re.I),
    ],
    "event": [
        re.compile(r"\b((?:yesterday|today|last week|recently) (?:I|we|they))\b", re.I),
        re.compile(r"\b((?:happened|occurred|took place))\b", re.I),
        re.compile(r"\b((?:met|visited|attended|went to|completed|finished))\b", re.I),
        re.compile(r"\b(on (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))\b", re.I),
    ],
}

# =============================================================================
# Entity Extraction (Simple NER)
# =============================================================================

ENTITY_PATTERNS = [
    # Emails
    re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"),
    # URLs
    re.compile(r"https?://[^\s]+"),
    # ISO Dates
    re.compile(r"\b\d{4}-\d{2}-\d{2}\b"),
    # Named dates
    re.compile(r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b", re.I),
    # Times
    re.compile(r"\b\d{1,2}:\d{2}(?:\s*(?:AM|PM|am|pm))?\b"),
    # Money
    re.compile(r"\$[\d,]+(?:\.\d{2})?"),
    # Capitalized phrases (potential names/companies)
    re.compile(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b"),
]

def extract_entities(text: str) -> List[str]:
    """Extract named entities from text."""
    entities = set()
    for pattern in ENTITY_PATTERNS:
        for match in pattern.findall(text):
            if isinstance(match, tuple):
                match = match[0]
            if 2 < len(match) < 50:
                entities.add(match.strip())
    return list(entities)


# =============================================================================
# Scoring Functions
# =============================================================================

def score_explicit_markers(text: str) -> float:
    """Score explicit memory markers."""
    for pattern in EXPLICIT_PATTERNS:
        if pattern.search(text):
            return 3.0
    return 0.0


def score_entity_density(text: str, entities: List[str]) -> float:
    """Score based on entity density."""
    words = len(text.split())
    if words == 0:
        return 0.0
    density = len(entities) / words
    return min(2.0, density * 4)


def score_emotional_intensity(text: str) -> float:
    """Score emotional intensity."""
    score = 0.0
    text_lower = text.lower()
    
    # High arousal words
    for word in HIGH_AROUSAL_WORDS:
        if word in text_lower:
            score += 0.5
    
    # Exclamation points
    score += text.count("!") * 0.2
    
    # ALL CAPS words (4+ chars)
    caps_words = re.findall(r"\b[A-Z]{4,}\b", text)
    score += len(caps_words) * 0.3
    
    return min(1.5, score)


def score_decision_markers(text: str) -> float:
    """Score decision/commitment markers."""
    score = 0.0
    for pattern, weight in DECISION_PATTERNS:
        if pattern.search(text):
            score += weight
    return min(2.0, score)


def score_correction_markers(text: str) -> float:
    """Score correction signals."""
    for pattern in CORRECTION_PATTERNS:
        if pattern.search(text):
            return 1.5
    return 0.0


def score_temporal_specificity(text: str) -> float:
    """Score temporal references."""
    score = 0.0
    for _, (pattern, weight) in TEMPORAL_PATTERNS.items():
        if pattern.search(text):
            score = max(score, weight)  # Take highest, don't stack
    return score


def score_causal_markers(text: str) -> float:
    """Score causality markers."""
    for pattern in CAUSAL_PATTERNS:
        if pattern.search(text):
            return 1.0
    return 0.0


def score_completion_markers(text: str) -> float:
    """Score task completion signals."""
    score = 0.0
    for pattern, weight in COMPLETION_PATTERNS:
        if pattern.search(text):
            score = max(score, weight)
    return score


# =============================================================================
# Type Detection
# =============================================================================

def detect_memory_type(text: str) -> str:
    """Detect the most likely memory type."""
    scores = {t: 0 for t in TYPE_PATTERNS}
    
    for mem_type, patterns in TYPE_PATTERNS.items():
        for pattern in patterns:
            if pattern.search(text):
                scores[mem_type] += 1
    
    # Find highest scoring type
    max_type = "fact"  # default
    max_score = 0
    for mem_type, score in scores.items():
        if score > max_score:
            max_score = score
            max_type = mem_type
    
    return max_type


# =============================================================================
# Main Scoring
# =============================================================================

@dataclass
class ScoringResult:
    """Result of memory scoring."""
    score: float
    memory_type: str
    signals: List[str]
    entities: List[str]
    should_store: bool
    breakdown: Dict[str, float] = field(default_factory=dict)


def score_memory(text: str, context: Optional[Dict] = None) -> ScoringResult:
    """
    Score a memory's importance using heuristics.
    
    Returns ScoringResult with score (0-10), detected type, and signals.
    """
    context = context or {}
    signals = []
    entities = extract_entities(text)
    
    # Calculate individual scores
    explicit = score_explicit_markers(text)
    if explicit > 0:
        signals.append("explicit_marker")
    
    entity_density = score_entity_density(text, entities)
    if entity_density > 0.5:
        signals.append("entity_rich")
    
    emotional = score_emotional_intensity(text)
    if emotional > 0.5:
        signals.append("emotional")
    
    decision = score_decision_markers(text)
    if decision > 0:
        signals.append("decision")
    
    correction = score_correction_markers(text)
    if correction > 0:
        signals.append("correction")
    
    temporal = score_temporal_specificity(text)
    if temporal > 0:
        signals.append("temporal")
    
    causal = score_causal_markers(text)
    if causal > 0:
        signals.append("causal")
    
    completion = score_completion_markers(text)
    if completion > 0:
        signals.append("failure" if completion == 0.8 else "completion")
    
    # Context modifiers
    context_score = 0.0
    if context.get("message_count", 0) > 20:
        context_score += 0.2
    if context.get("position") in ("opening", "closing"):
        context_score += 0.3
    context_score = min(2.0, context_score)
    if context_score > 0.5:
        signals.append("high_context")
    
    # Detect type
    memory_type = detect_memory_type(text)
    type_multiplier = TYPE_MULTIPLIERS.get(memory_type, 1.0)
    
    # Safety boost for constraints
    safety_boost = 0.0
    if memory_type == "constraint":
        text_lower = text.lower()
        for keyword in SAFETY_KEYWORDS:
            if keyword in text_lower:
                safety_boost = 2.0
                signals.append("safety_critical")
                break
    
    # Calculate base score
    base_score = (explicit + entity_density + emotional + decision + 
                  correction + temporal + causal + completion + context_score + safety_boost)
    
    # Apply type multiplier
    final_score = base_score * type_multiplier
    
    return ScoringResult(
        score=round(final_score * 100) / 100,
        memory_type=memory_type,
        signals=signals,
        entities=entities,
        should_store=final_score >= STORAGE_THRESHOLD,
        breakdown={
            "explicit": explicit,
            "entity_density": entity_density,
            "emotional": emotional,
            "decision": decision,
            "correction": correction,
            "temporal": temporal,
            "causal": causal,
            "completion": completion,
            "context": context_score,
            "safety_boost": safety_boost,
            "type_multiplier": type_multiplier,
        }
    )


# =============================================================================
# Batch Processing
# =============================================================================

@dataclass
class ExtractedMemory:
    """A memory extracted from conversation."""
    content: str
    result: ScoringResult


def extract_memories_from_conversation(
    messages: List[Dict[str, str]],
    window_size: int = 10
) -> List[ExtractedMemory]:
    """
    Extract memorable content from a conversation.
    
    Args:
        messages: List of {"role": "user"|"assistant", "content": "..."}
        window_size: Number of recent messages to consider
    
    Returns:
        List of ExtractedMemory objects that scored above threshold
    """
    recent = messages[-window_size:]
    candidates = []
    
    for i, msg in enumerate(recent):
        # Skip very short messages
        if len(msg.get("content", "")) < 20:
            continue
        
        # Skip assistant messages (usually)
        if msg.get("role") == "assistant":
            continue
        
        # Build context
        context = {
            "message_count": len(messages),
            "position": "opening" if i == 0 else ("closing" if i == len(recent) - 1 else "middle"),
        }
        
        result = score_memory(msg["content"], context)
        
        if result.should_store:
            candidates.append(ExtractedMemory(
                content=msg["content"],
                result=result
            ))
    
    return candidates


# =============================================================================
# CLI for Testing
# =============================================================================

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python heuristics.py 'text to score'")
        sys.exit(1)
    
    text = " ".join(sys.argv[1:])
    result = score_memory(text)
    
    print(f"Score: {result.score}")
    print(f"Type: {result.memory_type}")
    print(f"Should store: {result.should_store}")
    print(f"Signals: {', '.join(result.signals) or 'none'}")
    print(f"Entities: {', '.join(result.entities) or 'none'}")
    print("\nBreakdown:")
    for key, value in result.breakdown.items():
        if value > 0:
            print(f"  {key}: {value}")
