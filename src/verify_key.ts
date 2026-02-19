import OpenAI from 'openai';

const KEY = process.env.OPENAI_API_KEY;

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
