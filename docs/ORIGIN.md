# Why We Built This

**rag-sentinel** started from a recurring enterprise problem: RAG systems were becoming operational dependencies long before they became operationally legible. Teams could report token counts, latency, and uptime, but when answer quality slipped, they still ended up debugging the system by hand. The real questions were harder: did the corpus age out in a meaningful way, did a chunking change distort retrieval, did the evidence chain get weaker, and were people now trusting answers that looked polished but were grounded poorly.

That pattern showed up repeatedly in AI platform and knowledge-system work. The infrastructure around retrieval was usually decent. There might be vector indexes, prompt traces, model dashboards, and even evaluation harnesses. But none of that guaranteed a usable operational answer when someone asked why the system had started citing stale content, pulling weak chunks, or hallucinating around a familiar topic. The evidence was there in fragments. The operating layer was not.

That gap is why **rag-sentinel** exists. We built it to make retrieval quality reviewable in the same way teams already review latency, error rate, or release risk. The goal was not another "chat with your docs" repo. The goal was a control surface for the problems that matter after the novelty wears off: chunk quality, source freshness, retrieval drift, hallucination pressure, and PII leakage risk.

Existing tools helped, but they missed the center of gravity. LLM observability platforms could show traces. Vector tooling could show index state. Evaluation suites could score snapshots. What they still did not provide was a durable operator workflow for evidence quality under change. They did not naturally connect corpus drift, retrieval behavior, and trust decisions in a way a platform lead, security partner, or review board could use quickly.

That shaped the design philosophy:

- **operator-first** so the repo surfaces the riskiest retrieval signal first
- **evidence-led** so review starts from sources and grounding, not cosmetics
- **CISO-legible** so the same surface can support AI risk conversations, not just ML tuning
- **CI-native** so retrieval checks can live near deploy and data-refresh workflows

The repo also deliberately avoids two traps. It is not a research benchmark pretending to be a product, and it is not a thin wrapper around a vector database. It is a practical attempt to model what a real reliability layer for enterprise RAG should look like once governance, trust, and content drift all become day-two problems.

Next on the roadmap is deeper collection history, stronger release-diff reporting, and clearer evidence exports for AI governance review. The long-term value of **rag-sentinel** is not a single score or screen. It is the operating discipline of making RAG evidence quality visible enough to review, challenge, and improve.