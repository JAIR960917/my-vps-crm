import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Verify caller is authenticated
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
  if (!caller) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Check caller role
  const { data: callerRoles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id);

  const isAdmin = callerRoles?.some((r) => r.role === "admin");
  const isGerente = callerRoles?.some((r) => r.role === "gerente");

  if (!isAdmin && !isGerente) {
    return new Response(JSON.stringify({ error: "Sem permissão para criar usuários" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { email, password, full_name, role } = await req.json();

  if (!email || !password || !role) {
    return new Response(JSON.stringify({ error: "Email, senha e papel são obrigatórios" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Gerentes cannot create admins
  if (isGerente && !isAdmin && role === "admin") {
    return new Response(JSON.stringify({ error: "Gerentes não podem criar administradores" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get gerente's company_id
  let companyId: string | null = null;
  if (isGerente && !isAdmin) {
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("user_id", caller.id)
      .single();
    companyId = callerProfile?.company_id || null;
    if (!companyId) {
      return new Response(JSON.stringify({ error: "Gerente não está alocado a nenhuma empresa" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Create user
  const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name || "" },
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Assign role
  await supabaseAdmin.from("user_roles").insert({
    user_id: newUser.user.id,
    role,
  });

  // If created by gerente, auto-assign to same company
  if (companyId) {
    await supabaseAdmin
      .from("profiles")
      .update({ company_id: companyId })
      .eq("user_id", newUser.user.id);
  }

  return new Response(JSON.stringify({ message: "Usuário criado", userId: newUser.user.id }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
