export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    // Health check
    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "GrowthOS API"
      });
    }

    // Generate Marketing Kit
    if (url.pathname === "/api/generate" && request.method === "POST") {
      return handleGenerate(request, env);
    }

    return new Response("GrowthOS API is running.", {
      status: 200,
      headers: corsHeaders()
    });
  }
};


async function handleGenerate(request, env) {
  try {
    // --------------------------------------------------
    // 1. Check required environment variables
    // --------------------------------------------------

    if (!env.GEMINI_API_KEY) {
      return json({
        error: "GEMINI_API_KEY is not configured."
      }, 500);
    }

    if (!env.SUPABASE_URL) {
      return json({
        error: "SUPABASE_URL is not configured."
      }, 500);
    }

    if (!env.SUPABASE_SECRET_KEY) {
      return json({
        error: "SUPABASE_SECRET_KEY is not configured."
      }, 500);
    }


    // --------------------------------------------------
    // 2. Get authenticated user
    // --------------------------------------------------

    const authHeader = request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return json({
        error: "Authentication required."
      }, 401);
    }

    const accessToken = authHeader.substring(7);


    // Ask Supabase who owns this token
    const userResponse = await fetch(
      `${env.SUPABASE_URL}/auth/v1/user`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "apikey": env.SUPABASE_SECRET_KEY
        }
      }
    );

    if (!userResponse.ok) {
      return json({
        error: "Invalid or expired authentication session."
      }, 401);
    }

    const user = await userResponse.json();

    if (!user?.id) {
      return json({
        error: "Unable to identify authenticated user."
      }, 401);
    }

    const userId = user.id;


    // --------------------------------------------------
    // 3. Read request body
    // --------------------------------------------------

    const body = await request.json();

    const businessType = String(body.type || "").trim();
    const city = String(body.city || "").trim();
    const offer = String(body.offer || "").trim();
    const audience = String(body.audience || "").trim();

    if (!businessType || !offer) {
      return json({
        error: "Business type and offer are required."
      }, 400);
    }


    // --------------------------------------------------
    // 4. Get user profile
    // --------------------------------------------------

    const profileResponse = await supabaseRequest(
      env,
      `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,plan,generations_used,generations_limit`,
      {
        method: "GET"
      }
    );

    if (!profileResponse.ok) {
      return json({
        error: "Unable to load your GrowthOS profile."
      }, 500);
    }

    let profiles = await profileResponse.json();

    // In case the profile was not created by the signup trigger
    if (!profiles.length) {
      const createProfileResponse = await supabaseRequest(
        env,
        "/rest/v1/profiles",
        {
          method: "POST",
          headers: {
            "Prefer": "return=representation"
          },
          body: JSON.stringify({
            id: userId,
            full_name:
              user.user_metadata?.full_name ||
              user.email?.split("@")[0] ||
              "",
            plan: "free",
            generations_used: 0,
            generations_limit: 3
          })
        }
      );

      if (!createProfileResponse.ok) {
        return json({
          error: "Unable to create your GrowthOS profile."
        }, 500);
      }

      profiles = await createProfileResponse.json();
    }

    const profile = profiles[0];


    // --------------------------------------------------
    // 5. Check generation limit
    // --------------------------------------------------

    const used = Number(profile.generations_used || 0);
    const limit = Number(profile.generations_limit || 0);

    if (used >= limit) {
      return json({
        error: "You have reached your current generation limit.",
        plan: profile.plan,
        generations_used: used,
        generations_limit: limit
      }, 429);
    }


    // --------------------------------------------------
    // 6. Generate AI marketing kit
    // --------------------------------------------------

    const prompt = `
You are a practical small-business marketing strategist.

Business type: ${businessType}
City/market: ${city || "not specified"}
Main offer: ${offer}
Target customer: ${audience || "general customers"}

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
Do not invent prices, guarantees, awards, statistics, testimonials, or credentials.
`;

    const aiResponse = await fetch(
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

    const aiData = await aiResponse.json();

    if (!aiResponse.ok) {
      return json({
        error:
          aiData.error?.message ||
          "AI request failed."
      }, 502);
    }

    const text =
      aiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return json({
        error: "Empty AI response."
      }, 502);
    }

    let result;

    try {
      result = JSON.parse(text);
    } catch {
      return json({
        error: "AI returned invalid JSON."
      }, 502);
    }


    // --------------------------------------------------
    // 7. Save Marketing Kit
    // --------------------------------------------------

    const kitResponse = await supabaseRequest(
      env,
      "/rest/v1/marketing_kits",
      {
        method: "POST",
        headers: {
          "Prefer": "return=representation"
        },
        body: JSON.stringify({
          user_id: userId,
          business_type: businessType,
          city: city || null,
          product_service: offer,
          target_customer: audience || null,
          result: result
        })
      }
    );

    if (!kitResponse.ok) {
      const kitError = await kitResponse.text();

      console.error("Marketing kit save failed:", kitError);

      return json({
        error: "Marketing kit was generated but could not be saved."
      }, 500);
    }


    // --------------------------------------------------
    // 8. Update profile usage
    // --------------------------------------------------

    const newUsed = used + 1;

    const updateProfileResponse = await supabaseRequest(
      env,
      `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: {
          "Prefer": "return=minimal"
        },
        body: JSON.stringify({
          generations_used: newUsed
        })
      }
    );

    if (!updateProfileResponse.ok) {
      console.error(
        "Profile usage update failed:",
        await updateProfileResponse.text()
      );
    }


    // --------------------------------------------------
    // 9. Update usage table
    // --------------------------------------------------

    const today = new Date();

    const periodStart =
      today.toISOString().slice(0, 10);

    const periodEndDate =
      new Date(today);

    periodEndDate.setDate(
      periodEndDate.getDate() + 30
    );

    const periodEnd =
      periodEndDate.toISOString().slice(0, 10);


    const usageResponse = await supabaseRequest(
      env,
      "/rest/v1/usage",
      {
        method: "POST",
        headers: {
          "Prefer": "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify({
          user_id: userId,
          generation_count: 1,
          period_start: periodStart,
          period_end: periodEnd
        })
      }
    );

    if (!usageResponse.ok) {
      console.error(
        "Usage update failed:",
        await usageResponse.text()
      );
    }


    // --------------------------------------------------
    // 10. Return result to frontend
    // --------------------------------------------------

    return json({
      ...result,
      usage: {
        generations_used: newUsed,
        generations_limit: limit
      }
    });

  } catch (error) {

    console.error("GrowthOS error:", error);

    return json({
      error: error.message || "Server error."
    }, 500);
  }
}


// --------------------------------------------------
// Supabase helper
// --------------------------------------------------

async function supabaseRequest(env, path, options = {}) {

  const headers = new Headers(options.headers || {});

  headers.set(
    "apikey",
    env.SUPABASE_SECRET_KEY
  );

  headers.set(
    "Authorization",
    `Bearer ${env.SUPABASE_SECRET_KEY}`
  );

  headers.set(
    "Content-Type",
    "application/json"
  );

  return fetch(
    `${env.SUPABASE_URL}${path}`,
    {
      ...options,
      headers
    }
  );
}


// --------------------------------------------------
// JSON response helper
// --------------------------------------------------

function json(data, status = 200) {

  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "content-type": "application/json; charset=UTF-8",
        ...corsHeaders()
      }
    }
  );
}


// --------------------------------------------------
// CORS
// --------------------------------------------------

function corsHeaders() {

  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization"
  };
}
