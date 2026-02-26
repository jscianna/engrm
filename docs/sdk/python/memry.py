"""Minimal MEMRY Python SDK stub."""

from __future__ import annotations

from typing import Any
import requests


class MemryClient:
    def __init__(self, base_url: str, api_key: str, timeout: float = 20.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
        )

    def store_memory(self, text: str, namespace: str | None = None, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {"text": text}
        if namespace is not None:
            payload["namespace"] = namespace
        if metadata is not None:
            payload["metadata"] = metadata
        return self._post("/api/v1/memories", payload)

    def list_memories(self, namespace: str | None = None, limit: int = 50, since: str | None = None) -> dict[str, Any]:
        params: dict[str, Any] = {"limit": limit}
        if namespace is not None:
            params["namespace"] = namespace
        if since is not None:
            params["since"] = since
        return self._get("/api/v1/memories", params=params)

    def search(self, query: str, top_k: int = 10, namespace: str | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {"query": query, "topK": top_k}
        if namespace is not None:
            payload["namespace"] = namespace
        return self._post("/api/v1/search", payload)

    def context(self, query: str, max_tokens: int = 1200, namespace: str | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {"query": query, "maxTokens": max_tokens}
        if namespace is not None:
            payload["namespace"] = namespace
        return self._post("/api/v1/context", payload)

    def create_session(self, namespace: str | None = None, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if namespace is not None:
            payload["namespace"] = namespace
        if metadata is not None:
            payload["metadata"] = metadata
        return self._post("/api/v1/sessions", payload)

    def add_session_memory(self, session_id: str, text: str, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {"text": text}
        if metadata is not None:
            payload["metadata"] = metadata
        return self._post(f"/api/v1/sessions/{session_id}/memories", payload)

    def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        response = self.session.get(f"{self.base_url}{path}", params=params, timeout=self.timeout)
        response.raise_for_status()
        return response.json()

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = self.session.post(f"{self.base_url}{path}", json=payload, timeout=self.timeout)
        response.raise_for_status()
        return response.json()
