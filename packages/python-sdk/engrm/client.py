"""
Engrm Python SDK - Model-agnostic memory for AI agents.

Simple API for persistent memory that works with any LLM.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

import httpx


class Engrm:
    """
    Model-agnostic Engrm client for persistent memory.
    
    Usage:
        from engrm import Engrm
        
        engrm = Engrm(api_key="mem_xxx")
        
        # Start a session
        session = engrm.session(first_message="Help with my project")
        print(session.context)  # Ready to inject
        
        # Store memories
        engrm.remember("User prefers TypeScript")
        
        # Search memories
        results = engrm.recall("user preferences")
        
        # Log a miss
        engrm.miss("couldn't find timezone")
    """
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        api_url: str = "https://www.engrm.xyz/api/v1",
        namespace: Optional[str] = None,
        timeout: float = 30.0,
    ):
        """
        Initialize the Engrm client.
        
        Args:
            api_key: Engrm API key (defaults to ENGRM_API_KEY env var)
            api_url: Engrm API base URL
            namespace: Optional namespace to scope memories
            timeout: Request timeout in seconds
        """
        self._api_key = api_key or os.environ.get("ENGRM_API_KEY", "")
        self._api_url = api_url.rstrip("/")
        self._namespace = namespace
        self._timeout = timeout
        
        if not self._api_key:
            raise ValueError("api_key is required (or set ENGRM_API_KEY env var)")
        
        self._client = httpx.Client(
            timeout=timeout,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
        )
    
    def session(
        self,
        first_message: str = "",
        metadata: Optional[Dict[str, Any]] = None,
        namespace: Optional[str] = None,
    ) -> "Session":
        """
        Start a new session and get initial context.
        
        Args:
            first_message: The first user message (for context retrieval)
            metadata: Optional session metadata
            namespace: Override default namespace for this session
            
        Returns:
            Session object with context property
        """
        return Session(
            client=self,
            first_message=first_message,
            metadata=metadata,
            namespace=namespace or self._namespace,
        )
    
    def remember(
        self,
        text: str,
        namespace: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Store a memory using the simple API (auto-classification).
        
        Args:
            text: The memory content to store
            namespace: Optional namespace override
            
        Returns:
            Dict with id and stored status
        """
        response = self._post("/simple/remember", {
            "text": text,
            **({"namespace": namespace or self._namespace} if (namespace or self._namespace) else {}),
        })
        return response
    
    def recall(
        self,
        query: str,
        limit: int = 5,
        namespace: Optional[str] = None,
    ) -> List[str]:
        """
        Search memories and get just the text content.
        
        Args:
            query: Search query
            limit: Maximum number of results
            namespace: Optional namespace override
            
        Returns:
            List of memory text strings
        """
        response = self._post("/simple/recall", {
            "query": query,
            "limit": limit,
            **({"namespace": namespace or self._namespace} if (namespace or self._namespace) else {}),
        })
        return response.get("results", [])
    
    def context(
        self,
        message: str = "",
        namespace: Optional[str] = None,
    ) -> str:
        """
        Get formatted context string ready to inject into prompts.
        
        Args:
            message: User message for context relevance
            namespace: Optional namespace override
            
        Returns:
            Formatted context string
        """
        response = self._client.post(
            f"{self._api_url}/simple/context",
            json={
                "message": message,
                **({"namespace": namespace or self._namespace} if (namespace or self._namespace) else {}),
            },
        )
        response.raise_for_status()
        return response.text
    
    def miss(
        self,
        query: str,
        context: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Log a memory miss - when you searched but didn't find what you needed.
        
        Args:
            query: What you were looking for
            context: Optional context about why you needed it
            session_id: Optional session ID to associate with
            
        Returns:
            Dict with logged status and suggestion
        """
        payload: Dict[str, Any] = {"query": query}
        if context:
            payload["context"] = context
        if session_id:
            payload["sessionId"] = session_id
        
        return self._post("/memories/miss", payload)
    
    def extract(
        self,
        conversation: List[Dict[str, str]],
        namespace: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Extract suggested memories from a conversation.
        
        Args:
            conversation: List of message dicts with role and content
            namespace: Optional namespace for suggested memories
            
        Returns:
            Dict with suggestions and tokensAnalyzed
        """
        payload: Dict[str, Any] = {"conversation": conversation}
        if namespace or self._namespace:
            payload["namespace"] = namespace or self._namespace
        
        return self._post("/extract", payload)
    
    def search(
        self,
        query: str,
        top_k: int = 10,
        namespace: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Search memories with full metadata.
        
        Args:
            query: Search query
            top_k: Maximum number of results
            namespace: Optional namespace override
            
        Returns:
            List of search results with scores and memory data
        """
        payload: Dict[str, Any] = {
            "query": query,
            "topK": top_k,
        }
        if namespace or self._namespace:
            payload["namespace"] = namespace or self._namespace
        
        return self._post("/search", payload)
    
    def store(
        self,
        content: str,
        title: Optional[str] = None,
        memory_type: str = "episodic",
        importance_tier: str = "normal",
        namespace: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Store a memory with explicit parameters.
        
        Args:
            content: The memory content
            title: Optional title
            memory_type: Type of memory
            importance_tier: critical, high, or normal
            namespace: Optional namespace override
            
        Returns:
            The created memory record
        """
        payload: Dict[str, Any] = {
            "content": content,
            "memoryType": memory_type,
            "importanceTier": importance_tier,
        }
        if title:
            payload["title"] = title
        if namespace or self._namespace:
            payload["namespace"] = namespace or self._namespace
        
        response = self._post("/memories?force=true", payload)
        return response.get("memory", response)
    
    def feedback(
        self,
        memory_id: str,
        rating: str,
    ) -> Dict[str, Any]:
        """
        Provide feedback on a memory.
        
        Args:
            memory_id: ID of the memory
            rating: "positive" or "negative"
            
        Returns:
            Updated memory info
        """
        return self._post("/feedback", {
            "memoryId": memory_id,
            "rating": rating,
        })
    
    def _post(self, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Make a POST request to the API."""
        response = self._client.post(f"{self._api_url}{path}", json=payload)
        response.raise_for_status()
        return response.json()
    
    def _get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Make a GET request to the API."""
        response = self._client.get(f"{self._api_url}{path}", params=params)
        response.raise_for_status()
        return response.json()
    
    def close(self) -> None:
        """Close the HTTP client."""
        self._client.close()
    
    def __enter__(self) -> "Engrm":
        return self
    
    def __exit__(self, *args: Any) -> None:
        self.close()


class Session:
    """
    A session for tracking conversation context and memory usage.
    
    Usage:
        session = engrm.session(first_message="Help with my project")
        
        # Get context for injection
        print(session.context)
        
        # Record turns
        session.turn(messages=[
            {"role": "user", "content": "..."},
            {"role": "assistant", "content": "..."}
        ])
        
        # End session
        summary = session.end(outcome="success")
    """
    
    def __init__(
        self,
        client: Engrm,
        first_message: str = "",
        metadata: Optional[Dict[str, Any]] = None,
        namespace: Optional[str] = None,
    ):
        self._client = client
        self._namespace = namespace
        self._session_id: Optional[str] = None
        self._context: Optional[str] = None
        self._turn_count = 0
        self._memories_used: List[str] = []
        
        # Start the session
        self._start(first_message, metadata)
    
    def _start(
        self,
        first_message: str,
        metadata: Optional[Dict[str, Any]],
    ) -> None:
        """Start the session and get initial context."""
        payload: Dict[str, Any] = {"firstMessage": first_message}
        if metadata:
            payload["metadata"] = metadata
        if self._namespace:
            payload["namespace"] = self._namespace
        
        response = self._client._post("/sessions/start", payload)
        
        self._session_id = response.get("sessionId")
        
        # Build context string from response
        context_data = response.get("context", {})
        lines: List[str] = []
        
        critical = context_data.get("critical", [])
        high = context_data.get("high", [])
        
        if critical or high:
            lines.append("Here's what you know about this user:")
            lines.append("")
        
        if critical:
            lines.append("## Core Information")
            for m in critical:
                lines.append(f"- {m.get('text', m.get('title', ''))}")
                self._memories_used.append(m.get("id", ""))
            lines.append("")
        
        if high:
            lines.append("## Relevant Context")
            for m in high:
                lines.append(f"- {m.get('text', m.get('title', ''))}")
                self._memories_used.append(m.get("id", ""))
            lines.append("")
        
        if lines:
            lines.append("Use this context to personalize your responses.")
        
        self._context = "\n".join(lines) if lines else ""
    
    @property
    def context(self) -> str:
        """Get the formatted context string ready to inject."""
        return self._context or ""
    
    @property
    def session_id(self) -> Optional[str]:
        """Get the session ID."""
        return self._session_id
    
    def turn(
        self,
        messages: List[Dict[str, str]],
        memories_used: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Record a turn in the session.
        
        Args:
            messages: Messages from this turn
            memories_used: Optional list of memory IDs that were used
            
        Returns:
            Dict with refreshNeeded and optional newContext
        """
        if not self._session_id:
            raise RuntimeError("Session not started")
        
        self._turn_count += 1
        
        payload: Dict[str, Any] = {
            "messages": messages,
            "turnNumber": self._turn_count,
        }
        if memories_used:
            payload["memoriesUsed"] = memories_used
            self._memories_used.extend(memories_used)
        
        response = self._client._post(
            f"/sessions/{self._session_id}/turn",
            payload,
        )
        
        # Update context if refresh provided
        if response.get("newContext"):
            new_context = response["newContext"]
            lines: List[str] = ["Here's what you know about this user:", ""]
            
            for m in new_context.get("critical", []):
                lines.append(f"- {m.get('text', m.get('title', ''))}")
            
            for m in new_context.get("high", []):
                lines.append(f"- {m.get('text', m.get('title', ''))}")
            
            if len(lines) > 2:
                lines.append("")
                lines.append("Use this context to personalize your responses.")
                self._context = "\n".join(lines)
        
        return response
    
    def end(
        self,
        outcome: str = "success",
        feedback: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        End the session and get summary.
        
        Args:
            outcome: "success", "failure", or "abandoned"
            feedback: Optional feedback notes
            
        Returns:
            Dict with summary, suggestedMemories, memoriesReinforced, analytics
        """
        if not self._session_id:
            raise RuntimeError("Session not started")
        
        payload: Dict[str, Any] = {"outcome": outcome}
        if feedback:
            payload["feedback"] = feedback
        
        response = self._client._post(
            f"/sessions/{self._session_id}/end",
            payload,
        )
        
        return response
    
    def remember(self, text: str) -> Dict[str, Any]:
        """Store a memory within this session's namespace."""
        return self._client.remember(text, namespace=self._namespace)
    
    def recall(self, query: str, limit: int = 5) -> List[str]:
        """Search memories within this session's namespace."""
        return self._client.recall(query, limit=limit, namespace=self._namespace)
    
    def miss(self, query: str, context: Optional[str] = None) -> Dict[str, Any]:
        """Log a miss associated with this session."""
        return self._client.miss(
            query=query,
            context=context,
            session_id=self._session_id,
        )


# Keep backward compatibility
EngrammaticClient = Engrm
