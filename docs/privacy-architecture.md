# FatHippo Privacy Architecture

## Current Model (Server-Trust)

FatHippo currently runs a server-trust privacy model for memory processing:

- Memory payloads are encrypted at rest per user in our database.
- Application servers can decrypt memory content for authorized API flows.
- Embedding generation is performed server-side and sends raw text to configured embedding providers.

This means the system is not zero-knowledge today.

## What True Zero-Knowledge Would Require

To offer true zero-knowledge behavior end-to-end, embedding and encryption operations must move to trusted client runtime surfaces:

- Generate embeddings locally on the client/device.
- Encrypt content locally before upload.
- Send only encrypted blobs plus vectors that cannot be reversed to plaintext.

Until that architecture is implemented, product claims must reflect the current server-trust model.
