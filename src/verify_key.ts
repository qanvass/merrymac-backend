import OpenAI from 'openai';

const KEY = "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";

async function verify() {
    const openai = new OpenAI({ apiKey: KEY });
    try {
        console.log("Verifying OpenAI connectivity...");
        const response = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [{ role: "user", content: "Say 'Connectivity Verified'" }],
        });
        console.log("Result:", response.choices[0].message.content);
    } catch (error: any) {
        console.error("Verification failed:", error.message);
    }
}

verify();
