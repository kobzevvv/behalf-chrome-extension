export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    console.log(`[${new Date().toISOString()}] Test request to ${path}`);
    console.log(`[${new Date().toISOString()}] env.DATABASE_URL exists: ${!!env.DATABASE_URL}`);
    console.log(`[${new Date().toISOString()}] env.DATABASE_URL type: ${typeof env.DATABASE_URL}`);
    console.log(`[${new Date().toISOString()}] env.DATABASE_URL length: ${env.DATABASE_URL ? env.DATABASE_URL.length : 'undefined'}`);
    
    return new Response(
      JSON.stringify({
        hasEnv: !!env.DATABASE_URL,
        envType: typeof env.DATABASE_URL,
        envLength: env.DATABASE_URL ? env.DATABASE_URL.length : 'undefined',
        envFirst50: env.DATABASE_URL ? env.DATABASE_URL.substring(0, 50) : 'undefined'
      }), 
      { 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        } 
      }
    );
  }
};
