import { CodeBlock, Note, H1, H2, H3, P, InlineCode, Footer } from "../../components";

export const metadata = {
  title: "Anthropic Integration | Engrm Docs",
  description: "Add persistent memory to Claude models with Engrm.",
};

export default function AnthropicGuidePage() {
  return (
    <>
      <H1>Anthropic Integration</H1>
      <P>
        Add persistent memory to Claude-powered agents. This guide shows how to 
        integrate Engrm with Claude 3.5 Sonnet, Claude 3 Opus, and other Anthropic models.
      </P>

      <H2 id="install">Installation</H2>
      <CodeBlock language="bash">{`pip install anthropic requests`}</CodeBlock>

      <H2 id="basic">Basic Integration</H2>
      <P>
        Simple context injection into Claude's system prompt:
      </P>

      <CodeBlock language="python">{`import os
import requests
import anthropic

# Configuration
ENGRM_API_KEY = os.environ.get("ENGRM_API_KEY", "mem_your_key")
ENGRM_URL = "https://engrm.xyz/api/v1"

client = anthropic.Anthropic()

def get_context(user_message: str) -> str:
    """Get relevant context from Engrm"""
    response = requests.post(
        f"{ENGRM_URL}/simple/context",
        headers={"Authorization": f"Bearer {ENGRM_API_KEY}"},
        json={"message": user_message}
    )
    return response.json().get("context", "")

def chat(user_message: str) -> str:
    """Chat with memory-augmented Claude"""
    context = get_context(user_message)
    
    system_prompt = f"""You are a helpful assistant with memory of past conversations.

{context}

Use the context above to personalize your responses. Reference previous 
conversations when relevant, but don't be repetitive about it."""

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=system_prompt,
        messages=[
            {"role": "user", "content": user_message}
        ]
    )
    
    return message.content[0].text

# Example
print(chat("What's my timezone?"))
# "Based on our previous conversations, you're in Singapore (GMT+8)..."
`}</CodeBlock>

      <H2 id="session-flow">Session-Based Flow</H2>
      <P>
        Full session tracking with Claude:
      </P>

      <CodeBlock language="python">{`import requests
import anthropic
from typing import Optional
from dataclasses import dataclass, field

ENGRM_API_KEY = "mem_your_key"
ENGRM_URL = "https://engrm.xyz/api/v1"

client = anthropic.Anthropic()

@dataclass
class EngramSession:
    session_id: Optional[str] = None
    context: str = ""
    turn_count: int = 0
    memories_used: list[str] = field(default_factory=list)
    messages: list[dict] = field(default_factory=list)

class ClaudeMemoryAgent:
    def __init__(self, namespace: Optional[str] = None):
        self.namespace = namespace
        self.session = EngramSession()
        self.headers = {"Authorization": f"Bearer {ENGRM_API_KEY}"}
    
    def start(self, first_message: str) -> dict:
        """Start session and get initial context"""
        payload = {"firstMessage": first_message}
        if self.namespace:
            payload["namespace"] = self.namespace
        
        response = requests.post(
            f"{ENGRM_URL}/sessions/start",
            headers=self.headers,
            json=payload
        ).json()
        
        self.session.session_id = response["sessionId"]
        
        # Build system context
        parts = []
        for mem in response["context"]["critical"]:
            parts.append(f"• {mem['text']}")
            self.session.memories_used.append(mem["id"])
        
        for mem in response["context"]["high"]:
            parts.append(f"• {mem['text']}")
            self.session.memories_used.append(mem["id"])
        
        self.session.context = "\\n".join(parts) if parts else ""
        
        return {
            "sessionId": self.session.session_id,
            "tokensInjected": response["stats"]["tokensInjected"],
            "memoriesLoaded": len(self.session.memories_used)
        }
    
    def chat(self, user_message: str) -> str:
        """Send message to Claude with memory context"""
        if not self.session.session_id:
            self.start(user_message)
        
        self.session.turn_count += 1
        self.session.messages.append({"role": "user", "content": user_message})
        
        # Build system prompt
        system = "You are a helpful assistant with memory of past conversations."
        if self.session.context:
            system += f"\\n\\n## Remembered Context\\n{self.session.context}"
        
        # Call Claude
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            system=system,
            messages=self.session.messages
        )
        
        assistant_message = response.content[0].text
        self.session.messages.append({"role": "assistant", "content": assistant_message})
        
        # Record turn
        turn_response = requests.post(
            f"{ENGRM_URL}/sessions/{self.session.session_id}/turn",
            headers=self.headers,
            json={
                "turnNumber": self.session.turn_count,
                "messages": [
                    {"role": "user", "content": user_message},
                    {"role": "assistant", "content": assistant_message}
                ],
                "memoriesUsed": self.session.memories_used
            }
        ).json()
        
        # Handle context refresh
        if turn_response.get("refreshNeeded") and "newContext" in turn_response:
            new_parts = []
            for mem in turn_response["newContext"].get("high", []):
                new_parts.append(f"• {mem['text']}")
                if mem["id"] not in self.session.memories_used:
                    self.session.memories_used.append(mem["id"])
            
            if new_parts:
                self.session.context += "\\n\\n## Updated Context\\n" + "\\n".join(new_parts)
        
        return assistant_message
    
    def remember(self, text: str) -> str:
        """Store a memory"""
        response = requests.post(
            f"{ENGRM_URL}/simple/remember",
            headers=self.headers,
            json={"text": text}
        ).json()
        return response.get("id", "")
    
    def recall(self, query: str, limit: int = 5) -> list[str]:
        """Search memories"""
        response = requests.post(
            f"{ENGRM_URL}/simple/recall",
            headers=self.headers,
            json={"query": query, "limit": limit}
        ).json()
        return response.get("results", [])
    
    def end(self, outcome: str = "success"):
        """End the session"""
        if self.session.session_id:
            requests.post(
                f"{ENGRM_URL}/sessions/{self.session.session_id}/end",
                headers=self.headers,
                json={"outcome": outcome}
            )
        self.session = EngramSession()

# Usage
agent = ClaudeMemoryAgent(namespace="project-work")
info = agent.start("Help me with my Python project")
print(f"Session: {info['sessionId']}, Memories loaded: {info['memoriesLoaded']}")

response = agent.chat("What testing framework should I use?")
print(response)

agent.remember("User decided to use pytest for testing")
agent.end()
`}</CodeBlock>

      <H2 id="tool-use">Tool Use with Memory</H2>
      <P>
        Let Claude decide when to remember and recall:
      </P>

      <CodeBlock language="python">{`import json
import requests
import anthropic

ENGRM_API_KEY = "mem_your_key"
client = anthropic.Anthropic()

# Define tools
tools = [
    {
        "name": "remember",
        "description": "Store important information about the user for future conversations. Use for preferences, facts, decisions, and things the user explicitly asks you to remember.",
        "input_schema": {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "The information to remember"
                }
            },
            "required": ["text"]
        }
    },
    {
        "name": "recall",
        "description": "Search for relevant memories about the user. Use when you need context about past conversations, preferences, or decisions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "What to search for"
                }
            },
            "required": ["query"]
        }
    }
]

def handle_tool(name: str, input: dict) -> str:
    """Handle tool calls"""
    headers = {"Authorization": f"Bearer {ENGRM_API_KEY}"}
    
    if name == "remember":
        response = requests.post(
            "https://engrm.xyz/api/v1/simple/remember",
            headers=headers,
            json={"text": input["text"]}
        ).json()
        return f"Remembered: {input['text']}"
    
    elif name == "recall":
        response = requests.post(
            "https://engrm.xyz/api/v1/simple/recall",
            headers=headers,
            json={"query": input["query"], "limit": 5}
        ).json()
        results = response.get("results", [])
        if results:
            return "Found memories:\\n" + "\\n".join(f"• {r}" for r in results)
        return "No relevant memories found."
    
    return "Unknown tool"

def chat_with_tools(user_message: str, history: list = None) -> str:
    """Chat with Claude using memory tools"""
    messages = history or []
    messages.append({"role": "user", "content": user_message})
    
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system="You are a helpful assistant with access to memory tools. Use 'recall' to find relevant context before answering questions about the user. Use 'remember' to store important information.",
        tools=tools,
        messages=messages
    )
    
    # Handle tool use
    while response.stop_reason == "tool_use":
        tool_results = []
        assistant_content = response.content
        
        for block in response.content:
            if block.type == "tool_use":
                result = handle_tool(block.name, block.input)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result
                })
        
        messages.append({"role": "assistant", "content": assistant_content})
        messages.append({"role": "user", "content": tool_results})
        
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system="You are a helpful assistant with access to memory tools.",
            tools=tools,
            messages=messages
        )
    
    return response.content[0].text

# Usage
print(chat_with_tools("Remember that I prefer Python over JavaScript"))
print(chat_with_tools("What programming language do I prefer?"))
`}</CodeBlock>

      <H2 id="best-practices">Best Practices for Claude</H2>
      <ul className="list-disc list-inside text-zinc-400 space-y-2 mb-4">
        <li>
          <strong>Use the system prompt:</strong> Claude respects system prompts well—put 
          context there rather than in user messages
        </li>
        <li>
          <strong>Be explicit about memory:</strong> Tell Claude it has access to memory 
          and should use the context provided
        </li>
        <li>
          <strong>Avoid repetition:</strong> Include a note like "don't repeatedly 
          mention that you remember things" to keep responses natural
        </li>
        <li>
          <strong>Use tool use:</strong> Claude's tool use is excellent for dynamic 
          remember/recall during conversations
        </li>
      </ul>

      <Note type="tip">
        Claude 3.5 Sonnet is the best balance of cost and capability for memory-augmented 
        agents. Use Opus for complex reasoning tasks where the extra cost is justified.
      </Note>

      <Footer />
    </>
  );
}
