import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Accept credentials from request body
  const { email, password, full_name } = await req.json();

  if (!email || !password) {
    return new Response(JSON.stringify({ error: "Email e senha são obrigatórios" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Check if any admin already exists
  const { data: existingAdmins } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("role", "admin")
    .limit(1);

  if (existingAdmins && existingAdmins.length > 0) {
    return new Response(JSON.stringify({ message: "Admin already exists" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Create admin user
  const { data: user, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name || "Admin Principal" },
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Assign admin role
  await supabaseAdmin.from("user_roles").insert({
    user_id: user.user.id,
    role: "admin",
  });

  return new Response(JSON.stringify({ message: "Admin created", userId: user.user.id }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
