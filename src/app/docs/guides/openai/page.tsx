import { CodeBlock, Note, H1, H2, H3, P, InlineCode, Footer } from "../../components";

export const metadata = {
  title: "OpenAI Integration | FatHippo Docs",
  description: "Add persistent memory to GPT-4, GPT-4o, and other OpenAI models.",
};

export default function OpenAIGuidePage() {
  return (
    <>
      <H1>OpenAI Integration</H1>
      <P>
        Add persistent memory to your OpenAI-powered agents. This guide shows how to 
        integrate FatHippo with GPT-4o, GPT-4, and other OpenAI models.
      </P>

      <H2 id="install">Installation</H2>
      <CodeBlock language="bash">{`pip install openai requests`}</CodeBlock>

      <H2 id="basic">Basic Integration</H2>
      <P>
        The simplest integration: get context and inject it into the system prompt.
      </P>

      <CodeBlock language="python">{`import os
import requests
from openai import OpenAI

# Configuration
ENGRM_API_KEY = os.environ.get("ENGRM_API_KEY", "mem_your_key")
ENGRM_URL = "https://fathippo.ai/api/v1"

client = OpenAI()

def get_context(user_message: str) -> str:
    """Get relevant context from FatHippo"""
    response = requests.post(
        f"{ENGRM_URL}/simple/context",
        headers={"Authorization": f"Bearer {ENGRM_API_KEY}"},
        json={"message": user_message}
    )
    return response.json().get("context", "")

def chat(user_message: str) -> str:
    """Chat with memory-augmented GPT"""
    context = get_context(user_message)
    
    messages = [
        {
            "role": "system",
            "content": f"""You are a helpful assistant with memory of past conversations.

{context}

Use the context above to personalize your responses. Reference previous 
conversations when relevant."""
        },
        {"role": "user", "content": user_message}
    ]
    
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages
    )
    
    return response.choices[0].message.content

# Example
print(chat("Schedule a meeting for next week"))
# "Based on your preference for morning meetings and your Singapore timezone..."
`}</CodeBlock>

      <H2 id="session-flow">Session-Based Flow</H2>
      <P>
        For better tracking and analytics, use the full session API:
      </P>

      <CodeBlock language="python">{`import requests
from openai import OpenAI
from typing import Optional

ENGRM_API_KEY = "mem_your_key"
ENGRM_URL = "https://fathippo.ai/api/v1"

client = OpenAI()

class MemoryAgent:
    def __init__(self):
        self.session_id: Optional[str] = None
        self.turn_count = 0
        self.context = ""
        self.memories_used: list[str] = []
    
    def start_session(self, first_message: str):
        """Start a new session and get initial context"""
        response = requests.post(
            f"{ENGRM_URL}/sessions/start",
            headers={"Authorization": f"Bearer {ENGRM_API_KEY}"},
            json={"firstMessage": first_message}
        ).json()
        
        self.session_id = response["sessionId"]
        self.turn_count = 0
        
        # Build context from critical + high memories
        context_parts = []
        
        if response["context"]["critical"]:
            context_parts.append("## Core Context")
            for mem in response["context"]["critical"]:
                context_parts.append(f"- {mem['text']}")
                self.memories_used.append(mem["id"])
        
        if response["context"]["high"]:
            context_parts.append("\\n## Relevant Context")
            for mem in response["context"]["high"]:
                context_parts.append(f"- {mem['text']}")
                self.memories_used.append(mem["id"])
        
        self.context = "\\n".join(context_parts)
        
        print(f"Session started: {self.session_id}")
        print(f"Tokens injected: {response['stats']['tokensInjected']}")
    
    def chat(self, user_message: str) -> str:
        """Send a message and get response"""
        if not self.session_id:
            self.start_session(user_message)
        
        self.turn_count += 1
        
        messages = [
            {
                "role": "system",
                "content": f"You are a helpful assistant.\\n\\n{self.context}"
            },
            {"role": "user", "content": user_message}
        ]
        
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages
        )
        
        assistant_message = response.choices[0].message.content
        
        # Record the turn
        turn_response = requests.post(
            f"{ENGRM_URL}/sessions/{self.session_id}/turn",
            headers={"Authorization": f"Bearer {ENGRM_API_KEY}"},
            json={
                "turnNumber": self.turn_count,
                "messages": [
                    {"role": "user", "content": user_message},
                    {"role": "assistant", "content": assistant_message}
                ],
                "memoriesUsed": self.memories_used
            }
        ).json()
        
        # Refresh context if needed
        if turn_response.get("refreshNeeded") and "newContext" in turn_response:
            self._update_context(turn_response["newContext"])
        
        return assistant_message
    
    def _update_context(self, new_context: dict):
        """Update context with fresh memories"""
        context_parts = [self.context]
        
        if new_context.get("high"):
            context_parts.append("\\n## Updated Context")
            for mem in new_context["high"]:
                context_parts.append(f"- {mem['text']}")
                if mem["id"] not in self.memories_used:
                    self.memories_used.append(mem["id"])
        
        self.context = "\\n".join(context_parts)
    
    def remember(self, text: str):
        """Store a new memory"""
        requests.post(
            f"{ENGRM_URL}/simple/remember",
            headers={"Authorization": f"Bearer {ENGRM_API_KEY}"},
            json={"text": text}
        )
    
    def end_session(self, outcome: str = "success"):
        """End the session"""
        if self.session_id:
            requests.post(
                f"{ENGRM_URL}/sessions/{self.session_id}/end",
                headers={"Authorization": f"Bearer {ENGRM_API_KEY}"},
                json={"outcome": outcome}
            )
            self.session_id = None

# Usage
agent = MemoryAgent()
print(agent.chat("Help me plan my week"))
agent.remember("User prefers to front-load meetings on Monday")
print(agent.chat("What should I do on Friday?"))
agent.end_session()
`}</CodeBlock>

      <H2 id="extraction">Auto-Extract Memories</H2>
      <P>
        Automatically extract memories from conversations:
      </P>

      <CodeBlock language="python">{`def extract_and_store(conversation: list[dict]):
    """Extract memories from conversation and store them"""
    response = requests.post(
        f"{ENGRM_URL}/extract",
        headers={"Authorization": f"Bearer {ENGRM_API_KEY}"},
        json={"conversation": conversation}
    ).json()
    
    # Store high-confidence suggestions
    for suggestion in response["suggestions"]:
        if suggestion["confidence"] >= 0.8:
            requests.post(
                f"{ENGRM_URL}/memories",
                headers={"Authorization": f"Bearer {ENGRM_API_KEY}"},
                json={
                    "content": suggestion["content"],
                    "memoryType": suggestion["memoryType"],
                    "importanceTier": suggestion["suggestedTier"]
                }
            )
            print(f"Stored: {suggestion['title']}")

# After conversation ends
extract_and_store([
    {"role": "user", "content": "My name is John and I prefer morning meetings"},
    {"role": "assistant", "content": "Nice to meet you, John!"}
])
`}</CodeBlock>

      <H2 id="best-practices">Best Practices</H2>
      <ul className="list-disc list-inside text-zinc-400 space-y-2 mb-4">
        <li>
          <strong>Start sessions with context:</strong> Always call <InlineCode>sessions/start</InlineCode> 
          or <InlineCode>simple/context</InlineCode> at conversation start
        </li>
        <li>
          <strong>Refresh every 5-10 turns:</strong> Topic drift happens; get fresh context periodically
        </li>
        <li>
          <strong>Extract at session end:</strong> Run extraction on completed conversations to capture learnings
        </li>
        <li>
          <strong>Use reinforcement:</strong> When a memory is helpful, call <InlineCode>/reinforce</InlineCode> with +1
        </li>
        <li>
          <strong>Log misses:</strong> When you don't have relevant context, log it with <InlineCode>/memories/miss</InlineCode>
        </li>
      </ul>

      <Note type="tip">
        OpenAI's function calling works great with FatHippo. Create functions for 
        <InlineCode>remember</InlineCode> and <InlineCode>recall</InlineCode> so the model 
        can decide when to store and retrieve memories.
      </Note>

      <Footer />
    </>
  );
}
