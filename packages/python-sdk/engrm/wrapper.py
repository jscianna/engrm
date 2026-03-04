"""
Low-level Engrm API wrapper.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional
import urllib.request
import urllib.error
import json


class EngrammaticWrapper:
    """
    Low-level wrapper for Engrm API calls.
    
    Handles authentication and HTTP requests to the Engrm API.
    """
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        api_url: str = "https://www.engrm.xyz/api/v1",
        namespace: Optional[str] = None,
    ):
        """
        Initialize the API wrapper.
        
        Args:
            api_key: Engrm API key (defaults to ENGRM_API_KEY env var)
            api_url: Base URL for Engrm API
            namespace: Optional namespace to scope all operations
        """
        self.api_key = api_key or os.environ.get("ENGRM_API_KEY", "")
        self.api_url = api_url.rstrip("/")
        self.namespace = namespace
        
        if not self.api_key:
            raise ValueError(
                "Engrm API key required. Pass api_key or set ENGRM_API_KEY env var."
            )
    
    def _request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """Make an authenticated request to the Engrm API."""
        url = f"{self.api_url}{endpoint}"
        
        # Add query params
        if params:
            query = "&".join(f"{k}={v}" for k, v in params.items() if v is not None)
            if query:
                url = f"{url}?{query}"
        
        # Prepare request
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        body = None
        if data is not None:
            body = json.dumps(data).encode("utf-8")
        
        req = urllib.request.Request(
            url,
            data=body,
            headers=headers,
            method=method,
        )
        
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8") if e.fp else ""
            raise EngrammaticError(
                f"API request failed: {e.code} {e.reason}",
                status_code=e.code,
                response=error_body,
            ) from e
        except urllib.error.URLError as e:
            raise EngrammaticError(f"Network error: {e.reason}") from e
    
    def store_memory(
        self,
        content: str,
        title: Optional[str] = None,
        memory_type: str = "episodic",
        importance_tier: str = "normal",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Store a new memory.
        
        Args:
            content: Memory content text
            title: Optional title
            memory_type: Type of memory
            importance_tier: Importance tier (critical, high, normal)
            metadata: Optional metadata dict
            
        Returns:
            Created memory record
        """
        data: Dict[str, Any] = {
            "content": content,
            "memoryType": memory_type,
            "importanceTier": importance_tier,
        }
        
        if title:
            data["title"] = title
        if metadata:
            data["metadata"] = metadata
        if self.namespace:
            data["namespace"] = self.namespace
        
        result = self._request("POST", "/memories", data=data)
        return result.get("memory", result)
    
    def search_memories(
        self,
        query: str,
        top_k: int = 5,
        since: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Search memories by semantic similarity.
        
        Args:
            query: Search query
            top_k: Maximum results
            since: ISO timestamp to filter by
            
        Returns:
            List of search results with scores
        """
        data: Dict[str, Any] = {
            "query": query,
            "topK": top_k,
        }
        
        if since:
            data["since"] = since
        if self.namespace:
            data["namespace"] = self.namespace
        
        results = self._request("POST", "/search", data=data)
        
        # Results is a list directly
        if isinstance(results, list):
            return results
        return results.get("results", [])
    
    def get_context(
        self,
        query: Optional[str] = None,
        max_tokens: int = 2000,
        include_critical: bool = True,
    ) -> str:
        """
        Get formatted memory context for injection.
        
        Args:
            query: Optional query to focus retrieval
            max_tokens: Maximum tokens in context
            include_critical: Include critical-tier memories
            
        Returns:
            Formatted context string
        """
        data: Dict[str, Any] = {
            "maxTokens": max_tokens,
            "includeCritical": include_critical,
        }
        
        if query:
            data["query"] = query
        if self.namespace:
            data["namespace"] = self.namespace
        
        result = self._request("POST", "/context", data=data)
        return result.get("context", "")
    
    def send_feedback(
        self,
        memory_id: str,
        rating: str,
        reason: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Send feedback on a memory.
        
        Args:
            memory_id: Memory ID
            rating: "positive" or "negative"
            reason: Optional reason
            
        Returns:
            Updated memory record
        """
        data: Dict[str, Any] = {
            "memoryId": memory_id,
            "rating": rating,
        }
        
        if reason:
            data["reason"] = reason
        
        return self._request("POST", "/feedback", data=data)
    
    def list_memories(
        self,
        limit: int = 50,
        since: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        List memories.
        
        Args:
            limit: Maximum memories to return
            since: ISO timestamp to filter by
            
        Returns:
            List of memory records
        """
        params: Dict[str, str] = {"limit": str(limit)}
        
        if since:
            params["since"] = since
        if self.namespace:
            params["namespace"] = self.namespace
        
        result = self._request("GET", "/memories", params=params)
        return result.get("memories", [])
    
    def get_analytics(
        self,
        period: str = "7d",
    ) -> Dict[str, Any]:
        """
        Get analytics data.
        
        Args:
            period: Time period (7d, 30d, 90d)
            
        Returns:
            Analytics data
        """
        return self._request("GET", "/analytics", params={"period": period})


class EngrammaticError(Exception):
    """Error from Engrm API."""
    
    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        response: Optional[str] = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.response = response
