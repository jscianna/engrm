import { CodeBlock, Note, H1, H2, H3, P, InlineCode, Footer } from "../../components";

export const metadata = {
  title: "LangChain Integration | Engrm Docs",
  description: "Add Engrm memory to LangChain agents and chains.",
};

export default function LangChainGuidePage() {
  return (
    <>
      <H1>LangChain Integration</H1>
      <P>
        Integrate Engrm with LangChain for persistent memory in your chains and agents.
        Works with any LLM backend (OpenAI, Anthropic, local models).
      </P>

      <H2 id="install">Installation</H2>
      <CodeBlock language="bash">{`pip install langchain langchain-openai requests`}</CodeBlock>

      <H2 id="custom-memory">Custom Memory Class</H2>
      <P>
        Create a LangChain-compatible memory class backed by Engrm:
      </P>

      <CodeBlock language="python">{`import requests
from typing import Any, Dict, List
from langchain.memory.chat_memory import BaseChatMemory
from langchain.schema import BaseMessage, HumanMessage, AIMessage

class EngramMemory(BaseChatMemory):
    """LangChain memory backed by Engrm"""
    
    api_key: str
    base_url: str = "https://fathippo.ai/api/v1"
    session_id: str = None
    namespace: str = None
    memory_key: str = "history"
    
    @property
    def memory_variables(self) -> List[str]:
        return [self.memory_key, "context"]
    
    def _get_headers(self) -> dict:
        return {"Authorization": f"Bearer {self.api_key}"}
    
    def start_session(self, first_message: str = "") -> str:
        """Start an Engrm session"""
        payload = {"firstMessage": first_message}
        if self.namespace:
            payload["namespace"] = self.namespace
        
        response = requests.post(
            f"{self.base_url}/sessions/start",
            headers=self._get_headers(),
            json=payload
        ).json()
        
        self.session_id = response["sessionId"]
        return self.session_id
    
    def load_memory_variables(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """Load context from Engrm"""
        user_input = inputs.get("input", inputs.get("question", ""))
        
        response = requests.post(
            f"{self.base_url}/simple/context",
            headers=self._get_headers(),
            json={"message": user_input, "limit": 10}
        ).json()
        
        return {
            self.memory_key: self.chat_memory.messages,
            "context": response.get("context", "")
        }
    
    def save_context(self, inputs: Dict[str, Any], outputs: Dict[str, str]) -> None:
        """Save conversation turn to Engrm"""
        input_str = inputs.get("input", inputs.get("question", ""))
        output_str = outputs.get("output", outputs.get("response", ""))
        
        self.chat_memory.add_user_message(input_str)
        self.chat_memory.add_ai_message(output_str)
        
        if self.session_id:
            requests.post(
                f"{self.base_url}/sessions/{self.session_id}/turn",
                headers=self._get_headers(),
                json={
                    "messages": [
                        {"role": "user", "content": input_str},
                        {"role": "assistant", "content": output_str}
                    ]
                }
            )
    
    def remember(self, text: str) -> str:
        """Store a memory in Engrm"""
        response = requests.post(
            f"{self.base_url}/simple/remember",
            headers=self._get_headers(),
            json={"text": text}
        ).json()
        return response.get("id", "")
    
    def recall(self, query: str, limit: int = 5) -> List[str]:
        """Search memories in Engrm"""
        response = requests.post(
            f"{self.base_url}/simple/recall",
            headers=self._get_headers(),
            json={"query": query, "limit": limit}
        ).json()
        return response.get("results", [])
    
    def clear(self) -> None:
        """End the session"""
        if self.session_id:
            requests.post(
                f"{self.base_url}/sessions/{self.session_id}/end",
                headers=self._get_headers(),
                json={"outcome": "success"}
            )
        self.session_id = None
        self.chat_memory.clear()`}</CodeBlock>

      <H2 id="conversation-chain">Conversation Chain</H2>
      <P>
        Use with LangChain's ConversationChain:
      </P>

      <CodeBlock language="python">{`from langchain.chains import ConversationChain
from langchain_openai import ChatOpenAI
from langchain.prompts import PromptTemplate

# Initialize memory
memory = EngramMemory(
    api_key="mem_your_key",
    namespace="langchain-demo"
)

# Custom prompt with Engrm context
template = """You are a helpful assistant with persistent memory.

## Remembered Context
{context}

## Conversation
{history}
Human: {input}
Assistant:"""

prompt = PromptTemplate(
    input_variables=["context", "history", "input"],
    template=template
)

# Create chain
llm = ChatOpenAI(model="gpt-4o", temperature=0.7)
chain = ConversationChain(
    llm=llm,
    memory=memory,
    prompt=prompt,
    verbose=True
)

# Start session and chat
memory.start_session("Help me plan a project")

response = chain.predict(input="What frameworks should I use for a web app?")
print(response)

# Store a learning
memory.remember("User is building a web app and prefers Python backends")

# End session when done
memory.clear()`}</CodeBlock>

      <H2 id="agent-tools">Agent with Memory Tools</H2>
      <P>
        Create tools for LangChain agents to use Engrm:
      </P>

      <CodeBlock language="python">{`from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_openai import ChatOpenAI
from langchain.tools import Tool
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
import requests

ENGRM_API_KEY = "mem_your_key"

def remember_tool(text: str) -> str:
    """Store a memory about the user"""
    response = requests.post(
        "https://fathippo.ai/api/v1/simple/remember",
        headers={"Authorization": f"Bearer {ENGRM_API_KEY}"},
        json={"text": text}
    ).json()
    return f"Remembered: {text}"

def recall_tool(query: str) -> str:
    """Search for relevant memories"""
    response = requests.post(
        "https://fathippo.ai/api/v1/simple/recall",
        headers={"Authorization": f"Bearer {ENGRM_API_KEY}"},
        json={"query": query, "limit": 5}
    ).json()
    results = response.get("results", [])
    if results:
        return "Found memories:\\n" + "\\n".join(f"• {r}" for r in results)
    return "No relevant memories found."

tools = [
    Tool(
        name="remember",
        func=remember_tool,
        description="Store important information about the user for future reference. Use for preferences, facts, and decisions."
    ),
    Tool(
        name="recall",
        func=recall_tool,
        description="Search for relevant memories about the user. Use when you need context from past conversations."
    )
]

# Create agent
llm = ChatOpenAI(model="gpt-4o", temperature=0)
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant with memory capabilities. Use the recall tool to find relevant context before answering questions about the user. Use the remember tool to store important information."),
    ("human", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad")
])

agent = create_openai_tools_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# Use the agent
result = agent_executor.invoke({
    "input": "Remember that I prefer Python over JavaScript"
})
print(result["output"])

result = agent_executor.invoke({
    "input": "What programming language do I prefer?"
})
print(result["output"])`}</CodeBlock>

      <H2 id="retriever">Custom Retriever</H2>
      <P>
        Use Engrm as a LangChain retriever for RAG chains:
      </P>

      <CodeBlock language="python">{`from langchain.schema import BaseRetriever, Document
from typing import List
import requests

class EngramRetriever(BaseRetriever):
    """LangChain retriever backed by Engrm"""
    
    api_key: str
    base_url: str = "https://fathippo.ai/api/v1"
    top_k: int = 5
    
    def _get_relevant_documents(self, query: str) -> List[Document]:
        """Retrieve relevant memories as documents"""
        response = requests.post(
            f"{self.base_url}/search",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={"query": query, "topK": self.top_k}
        ).json()
        
        documents = []
        for result in response:
            doc = Document(
                page_content=result["memory"]["text"],
                metadata={
                    "id": result["memory"]["id"],
                    "type": result["memory"]["memoryType"],
                    "score": result["score"],
                    "created_at": result["memory"]["createdAt"]
                }
            )
            documents.append(doc)
        
        return documents

# Use in a RAG chain
from langchain.chains import RetrievalQA
from langchain_openai import ChatOpenAI

retriever = EngramRetriever(api_key="mem_your_key", top_k=5)
llm = ChatOpenAI(model="gpt-4o")

qa_chain = RetrievalQA.from_chain_type(
    llm=llm,
    retriever=retriever,
    return_source_documents=True
)

result = qa_chain.invoke({"query": "What are the user's preferences?"})
print(result["result"])`}</CodeBlock>

      <H2 id="best-practices">Best Practices</H2>
      <ul className="list-disc list-inside text-zinc-400 space-y-2 mb-4">
        <li>
          <strong>Use namespaces:</strong> Separate memory by user, project, or conversation context
        </li>
        <li>
          <strong>Start sessions:</strong> Track conversations for better analytics
        </li>
        <li>
          <strong>Combine with other memory:</strong> Use Engrm for long-term, ConversationBufferMemory for short-term
        </li>
        <li>
          <strong>Agent tools:</strong> Let the LLM decide when to remember/recall
        </li>
      </ul>

      <Note type="tip">
        LangChain's memory classes are being deprecated in favor of LangGraph. 
        Consider using the retriever or tool patterns for new projects.
      </Note>

      <Footer />
    </>
  );
}
