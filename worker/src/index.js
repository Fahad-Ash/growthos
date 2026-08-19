export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/generate" && request.method === "POST") {
      try {
        const body = await request.json();

        if (!body.type || !body.offer) {
          return json({
            error: "Business type and offer are required."
          }, 400);
        }

        if (!env.GEMINI_API_KEY) {
          return json({
            error: "GEMINI_API_KEY is not configured."
          }, 500);
        }

        const prompt = `
You are a practical small-business marketing strategist.

Business type: ${body.type}
City/market: ${body.city || "not specified"}
Main offer: ${body.offer}
Target customer: ${body.audience || "general customers"}

Create a useful marketing kit.

Return ONLY valid JSON with exactly these keys:

social_posts
reel_hooks
offers
review_response

social_posts:
5 numbered social media posts.

reel_hooks:
5 short video hooks.

offers:
3 realistic promotional offers.

review_response:
1 professional customer review response.

Keep everything concise, specific and useful.
Do not make false claims.
`;

        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
          encodeURIComponent(env.GEMINI_API_KEY),
          {
            method: "POST",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: prompt
                    }
                  ]
                }
              ],
              generationConfig: {
                responseMimeType: "application/json"
              }
            })
          }
        );

        const data = await response.json();

        if (!response.ok) {
          return json({
            error: data.error?.message || "AI request failed."
          }, 502);
        }

        const text =
          data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
          return json({
            error: "Empty AI response."
          }, 502);
        }

        return json(JSON.parse(text));

      } catch (error) {
        return json({
          error: error.message || "Server error."
        }, 500);
      }
    }

    if (url.pathname === "/health") {
      return json({ ok: true });
    }

    return new Response("GrowthOS API is running.");
  }
};

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      }
    }
  );
}
