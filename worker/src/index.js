export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ==================================================
    // CORS PREFLIGHT
    // ==================================================

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    // ==================================================
    // HEALTH CHECK
    // ==================================================

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "GrowthOS API",
        configuration: {
          geminiConfigured: Boolean(env.GEMINI_API_KEY),
          supabaseUrlConfigured: Boolean(env.SUPABASE_URL),
          supabaseSecretConfigured: Boolean(
            env.SUPABASE_SECRET_KEY
          )
        }
      });
    }

    // ==================================================
    // GENERATE
    // ==================================================

    if (
      url.pathname === "/api/generate" &&
      request.method === "POST"
    ) {
      return handleGenerate(request, env);
    }

    // ==================================================
    // DEFAULT
    // ==================================================

    return new Response(
      "GrowthOS API is running.",
      {
        status: 200,
        headers: corsHeaders()
      }
    );
  }
};


// ======================================================
// GENERATE MARKETING KIT
// ======================================================

async function handleGenerate(request, env) {
  try {

    // ==================================================
    // CHECK ENVIRONMENT
    // ==================================================

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
        error:
          "SUPABASE_SECRET_KEY is not configured."
      }, 500);
    }


    // ==================================================
    // AUTHORIZATION HEADER
    // ==================================================

    const authHeader =
      request.headers.get("Authorization");

    if (
      !authHeader ||
      !authHeader.startsWith("Bearer ")
    ) {
      return json({
        error: "Authentication required."
      }, 401);
    }

    const accessToken =
      authHeader.substring(7).trim();

    if (!accessToken) {
      return json({
        error: "Authentication required."
      }, 401);
    }


    // ==================================================
    // VALIDATE USER SESSION WITH SUPABASE
    // ==================================================

    const userResponse = await fetch(
      `${env.SUPABASE_URL}/auth/v1/user`,
      {
        method: "GET",
        headers: {
          "Authorization":
            `Bearer ${accessToken}`,

          "apikey":
            env.SUPABASE_SECRET_KEY
        }
      }
    );

    if (!userResponse.ok) {

      const authError =
        await userResponse.text();

      console.error(
        "AUTH_VALIDATION_FAILED:",
        userResponse.status,
        authError
      );

      return json({
        error:
          "Invalid or expired authentication session."
      }, 401);
    }

    const user =
      await userResponse.json();

    if (!user || !user.id) {
      return json({
        error:
          "Unable to identify authenticated user."
      }, 401);
    }

    const userId = user.id;


    // ==================================================
    // READ REQUEST BODY
    // ==================================================

    let body;

    try {
      body = await request.json();
    } catch {
      return json({
        error:
          "Invalid JSON request body."
      }, 400);
    }


    // ==================================================
    // REQUEST FIELDS
    // ==================================================

    const businessType =
      String(body?.type || "").trim();

    const city =
      String(body?.city || "").trim();

    const offer =
      String(body?.offer || "").trim();

    const audience =
      String(body?.audience || "").trim();


    if (!businessType || !offer) {
      return json({
        error:
          "Business type and offer are required."
      }, 400);
    }


    // ==================================================
    // LOAD USER PROFILE
    // ==================================================

    const profilePath =
      `/rest/v1/profiles` +
      `?id=eq.${encodeURIComponent(userId)}` +
      `&select=id,full_name,plan,generations_used,generations_limit`;

    const profileResponse =
      await supabaseRequest(
        env,
        profilePath,
        {
          method: "GET"
        }
      );


    // ==================================================
    // PROFILE LOOKUP ERROR
    // ==================================================

    if (!profileResponse.ok) {

      const profileError =
        await profileResponse.text();

      console.error(
        "PROFILE_LOOKUP_FAILED:",
        profileResponse.status,
        profileError
      );

      return new Response(
        [
          "PROFILE_LOOKUP_FAILED",
          "",
          `HTTP STATUS: ${profileResponse.status}`,
          "",
          "SUPABASE ERROR:",
          profileError
        ].join("\n"),
        {
          status: 500,

          headers: {
            "Content-Type":
              "text/plain; charset=UTF-8",

            ...corsHeaders()
          }
        }
      );
    }


    // ==================================================
    // PARSE PROFILE RESPONSE
    // ==================================================

    let profiles;

    try {
      profiles =
        await profileResponse.json();
    } catch (error) {

      console.error(
        "PROFILE_RESPONSE_JSON_FAILED:",
        error
      );

      return json({
        error:
          "PROFILE_RESPONSE_JSON_FAILED"
      }, 500);
    }


    if (!Array.isArray(profiles)) {

      console.error(
        "PROFILE_RESPONSE_INVALID:",
        profiles
      );

      return json({
        error:
          "PROFILE_RESPONSE_INVALID",

        response:
          profiles
      }, 500);
    }


    // ==================================================
    // CREATE PROFILE IF MISSING
    // ==================================================

    if (profiles.length === 0) {

      const fullName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split("@")[0] ||
        "GrowthOS User";


      const createProfileResponse =
        await supabaseRequest(
          env,
          "/rest/v1/profiles",
          {
            method: "POST",

            headers: {
              "Prefer":
                "return=representation"
            },

            body: JSON.stringify({
              id: userId,

              full_name:
                fullName,

              plan:
                "free",

              generations_used:
                0,

              generations_limit:
                3
            })
          }
        );


      // ================================================
      // PROFILE CREATION ERROR
      // ================================================

      if (!createProfileResponse.ok) {

        const createError =
          await createProfileResponse.text();

        console.error(
          "PROFILE_CREATION_FAILED:",
          createProfileResponse.status,
          createError
        );

        return new Response(
          [
            "PROFILE_CREATION_FAILED",
            "",
            `HTTP STATUS: ${createProfileResponse.status}`,
            "",
            "SUPABASE ERROR:",
            createError
          ].join("\n"),
          {
            status: 500,

            headers: {
              "Content-Type":
                "text/plain; charset=UTF-8",

              ...corsHeaders()
            }
          }
        );
      }


      // ================================================
      // READ CREATED PROFILE
      // ================================================

      try {
        profiles =
          await createProfileResponse.json();
      } catch (error) {

        console.error(
          "PROFILE_CREATION_JSON_FAILED:",
          error
        );

        return json({
          error:
            "PROFILE_CREATION_JSON_FAILED"
        }, 500);
      }


      if (
        !Array.isArray(profiles) ||
        profiles.length === 0
      ) {

        console.error(
          "PROFILE_CREATION_EMPTY_RESPONSE:",
          profiles
        );

        return json({
          error:
            "PROFILE_CREATION_EMPTY_RESPONSE"
        }, 500);
      }
    }


    // ==================================================
    // PROFILE
    // ==================================================

    const profile =
      profiles[0];


    const used =
      Number(
        profile.generations_used ?? 0
      );


    const limit =
      Number(
        profile.generations_limit ?? 3
      );


    // ==================================================
    // VALIDATE GENERATION SETTINGS
    // ==================================================

    if (
      !Number.isFinite(used) ||
      !Number.isFinite(limit)
    ) {

      console.error(
        "PROFILE_GENERATION_VALUES_INVALID:",
        profile
      );

      return json({
        error:
          "Your GrowthOS profile has invalid generation settings."
      }, 500);
    }


    // ==================================================
    // GENERATION LIMIT
    // ==================================================

    if (used >= limit) {

      return json({
        error:
          "You have reached your current generation limit.",

        plan:
          profile.plan || "free",

        generations_used:
          used,

        generations_limit:
          limit
      }, 429);
    }


    // ==================================================
    // GEMINI PROMPT
    // ==================================================

    const prompt = `
You are a practical small-business marketing strategist.

Business type:
${businessType}

City/market:
${city || "not specified"}

Main offer:
${offer}

Target customer:
${audience || "general customers"}

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

Do not invent:
- prices
- guarantees
- awards
- statistics
- testimonials
- credentials
`;


    // ==================================================
    // GEMINI API
    // ==================================================

    const geminiUrl =
      `https://generativelanguage.googleapis.com/` +
      `v1beta/models/gemini-2.5-flash:generateContent` +
      `?key=${encodeURIComponent(
        env.GEMINI_API_KEY
      )}`;


    const aiResponse =
      await fetch(
        geminiUrl,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text:
                      prompt
                  }
                ]
              }
            ],

            generationConfig: {
              responseMimeType:
                "application/json"
            }
          })
        }
      );


    let aiData;

    try {
      aiData =
        await aiResponse.json();
    } catch {
      aiData = null;
    }


    // ==================================================
    // GEMINI ERROR
    // ==================================================

    if (!aiResponse.ok) {

      console.error(
        "GEMINI_API_ERROR:",
        aiResponse.status,
        JSON.stringify(aiData)
      );

      return json({
        error:
          aiData?.error?.message ||
          "AI request failed."
      }, 502);
    }


    // ==================================================
    // GET GEMINI TEXT
    // ==================================================

    const text =
      aiData
        ?.candidates?.[0]
        ?.content?.parts?.[0]
        ?.text;


    if (!text) {

      console.error(
        "GEMINI_EMPTY_RESPONSE:",
        JSON.stringify(aiData)
      );

      return json({
        error:
          "Empty AI response."
      }, 502);
    }


    // ==================================================
    // PARSE AI JSON
    // ==================================================

    let result;

    try {

      result =
        JSON.parse(text);

    } catch (parseError) {

      console.error(
        "GEMINI_JSON_PARSE_FAILED:",
        parseError,
        text
      );

      return json({
        error:
          "AI returned invalid JSON."
      }, 502);
    }


    // ==================================================
    // SAVE MARKETING KIT
    // ==================================================

    const kitResponse =
      await supabaseRequest(
        env,
        "/rest/v1/marketing_kits",
        {
          method: "POST",

          headers: {
            "Prefer":
              "return=representation"
          },

          body: JSON.stringify({

            user_id:
              userId,

            business_type:
              businessType,

            city:
              city || null,

            product_service:
              offer,

            target_customer:
              audience || null,

            result:
              result
          })
        }
      );


    // ==================================================
    // MARKETING KIT SAVE ERROR
    // ==================================================

    if (!kitResponse.ok) {

      const kitError =
        await kitResponse.text();

      console.error(
        "MARKETING_KIT_SAVE_FAILED:",
        kitResponse.status,
        kitError
      );

      return new Response(
        [
          "MARKETING_KIT_SAVE_FAILED",
          "",
          `HTTP STATUS: ${kitResponse.status}`,
          "",
          "SUPABASE ERROR:",
          kitError
        ].join("\n"),
        {
          status: 500,

          headers: {
            "Content-Type":
              "text/plain; charset=UTF-8",

            ...corsHeaders()
          }
        }
      );
    }


    // ==================================================
    // UPDATE GENERATION COUNT
    // ==================================================

    const newUsed =
      used + 1;


    const updateProfileResponse =
      await supabaseRequest(
        env,
        `/rest/v1/profiles?id=eq.${encodeURIComponent(
          userId
        )}`,
        {
          method: "PATCH",

          headers: {
            "Prefer":
              "return=minimal"
          },

          body: JSON.stringify({

            generations_used:
              newUsed,

            updated_at:
              new Date().toISOString()
          })
        }
      );


    // ==================================================
    // PROFILE UPDATE ERROR
    // ==================================================

    if (!updateProfileResponse.ok) {

      const updateError =
        await updateProfileResponse.text();

      console.error(
        "PROFILE_USAGE_UPDATE_FAILED:",
        updateProfileResponse.status,
        updateError
      );

      // Do not fail the whole generation.
    }


    // ==================================================
    // USAGE PERIOD
    // ==================================================

    const today =
      new Date();


    const periodStart =
      today
        .toISOString()
        .slice(0, 10);


    const periodEndDate =
      new Date(today);


    periodEndDate.setDate(
      periodEndDate.getDate() + 30
    );


    const periodEnd =
      periodEndDate
        .toISOString()
        .slice(0, 10);


    // ==================================================
    // SAVE USAGE
    // ==================================================

    const usageResponse =
      await supabaseRequest(
        env,
        "/rest/v1/usage",
        {
          method: "POST",

          headers: {
            "Prefer":
              "resolution=merge-duplicates,return=minimal"
          },

          body: JSON.stringify({

            user_id:
              userId,

            generation_count:
              1,

            period_start:
              periodStart,

            period_end:
              periodEnd
          })
        }
      );


    // ==================================================
    // USAGE ERROR
    // ==================================================

    if (!usageResponse.ok) {

      const usageError =
        await usageResponse.text();

      console.error(
        "USAGE_UPDATE_FAILED:",
        usageResponse.status,
        usageError
      );

      // Do not fail the generation.
    }


    // ==================================================
    // SUCCESS
    // ==================================================

    return json({

      ...result,

      usage: {

        generations_used:
          newUsed,

        generations_limit:
          limit
      }

    });

  } catch (error) {

    console.error(
      "GROWTHOS_UNHANDLED_ERROR:",
      error
    );

    return json({

      error:
        error?.message ||
        "Server error."

    }, 500);
  }
}


// ======================================================
// SUPABASE REST REQUEST
// ======================================================

async function supabaseRequest(
  env,
  path,
  options = {}
) {

  const headers =
    new Headers(
      options.headers || {}
    );


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


// ======================================================
// JSON RESPONSE
// ======================================================

function json(
  data,
  status = 200
) {

  return new Response(
    JSON.stringify(data),

    {
      status,

      headers: {

        "Content-Type":
          "application/json; charset=UTF-8",

        ...corsHeaders()
      }
    }
  );
}


// ======================================================
// CORS
// ======================================================

function corsHeaders() {

  return {

    "Access-Control-Allow-Origin":
      "*",

    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type, Authorization"
  };
}
