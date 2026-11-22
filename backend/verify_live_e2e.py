import httpx

client = httpx.Client(base_url="http://127.0.0.1:8000/api", timeout=20.0)

print("--- 1. Health ---")
print(client.get("/health").json())

print("\n--- 2. OpenAI Audit Status ---")
print(client.get("/agent/audit-status").json())

print("\n--- 3. Sarvam Voice Status ---")
print(client.get("/voice/status").json())

print("\n--- 4. Cashfree Sandbox Status ---")
print(client.get("/cashfree/status").json())

print("\n--- 5. Cashfree Create Sandbox Order ---")
r_ord = client.post("/payments/create-order", json={"amount": 250.0, "description": "Hackathon Demo Payment"})
ord_data = r_ord.json()
order_id = ord_data.get("order_id")
print("Order ID:", order_id, "Session ID received:", bool(ord_data.get("payment_session_id")), "Status:", ord_data.get("order_status"))

print("\n--- 6. Cashfree Verify Order ---")
r_ver = client.get(f"/payments/verify/{order_id}")
print(r_ver.json())

print("\n--- 7. Live GPT-4o-mini Agent Chat ---")
r_chat = client.post("/conversations/conv_hackathon_live/agent-chat", json={"message": f"Can you check the status of my order {order_id}?"})
chat_data = r_chat.json()
print("Engine:", chat_data.get("execution_engine"), "Fallback:", chat_data.get("is_fallback"))
print("Tools executed:", [t.get("tool") for t in chat_data.get("tools_executed", [])])
print("Response:", chat_data.get("content"))

print("\n--- 8. Live Sarvam TTS ---")
r_tts = client.post("/voice/synthesize", json={"text": "Your payment order is registered in Cashfree sandbox.", "language_code": "en-IN"})
tts_data = r_tts.json()
print("TTS Success:", tts_data.get("success"), "Audio format:", tts_data.get("audio_format"), "Audio Base64 length:", len(tts_data.get("audio_base64", "")))
