(()=>{var e={};e.id=6982,e.ids=[6982],e.modules={1163:(e,t,r)=>{"use strict";r.d(t,{X:()=>n});let o="http://localhost:3000",a="HoopHub";async function s(e){let{Resend:t}=await r.e(1846).then(r.bind(r,91846)),o=`${a} <${process.env.RESEND_FROM_EMAIL??"noreply@hoophub.app"}>`,s=new t(process.env.RESEND_API_KEY),{data:i,error:n}=await s.emails.send({from:o,to:e.to,subject:e.subject,html:e.html,text:e.text});return n?{success:!1,error:n.message}:{success:!0,messageId:i?.id}}async function i(e){let t,o,s=await r.e(9526).then(r.t.bind(r,49526,19));if(process.env.GMAIL_USER&&process.env.GMAIL_APP_PASSWORD)t=s.createTransport({service:"gmail",auth:{user:process.env.GMAIL_USER,pass:process.env.GMAIL_APP_PASSWORD}}),o=`${a} <${process.env.GMAIL_USER}>`;else{if(!process.env.SMTP_HOST)return{success:!1,error:"Nenhum transporte SMTP configurado"};t=s.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT??587),secure:"true"===process.env.SMTP_SECURE,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}}),o=`${a} <${process.env.SMTP_FROM??process.env.SMTP_USER??"noreply@hoophub.app"}>`}return{success:!0,messageId:(await t.sendMail({from:o,to:e.to,subject:e.subject,html:e.html,text:e.text})).messageId}}async function n(e){let t=`${o}/activate?token=${e.activationToken}`,{subject:r,html:a,text:n}=function(e){let{name:t,activationLink:r,appUrl:o,expiresHours:a=24}=e,s=`${o}/assets/logo/hoophub.png`,i=t.split(" ")[0],n="Ativa a tua conta HoopHub",l=`<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${n}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:'Segoe UI',Arial,sans-serif;">

  <!-- Wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">

        <!-- Card -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;
                      box-shadow:0 2px 12px rgba(0,0,0,0.08);overflow:hidden;">

          <!-- Cabe\xe7alho azul com logo -->
          <tr>
            <td align="center"
                style="background:linear-gradient(160deg,#0A1A2F 0%,#061020 100%);
                       padding:32px 40px 28px;">
              <img
                src="${s}"
                alt="HoopHub"
                width="140"
                height="auto"
                style="display:block;max-width:140px;height:auto;"
              />
            </td>
          </tr>

          <!-- Corpo -->
          <tr>
            <td style="padding:40px 40px 32px;">

              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0A1A2F;
                         line-height:1.3;">
                Bem-vindo \xe0 HoopHub, ${i}!
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
                A tua conta foi criada com sucesso. Para come\xe7ares a usar a plataforma,
                precisas de ativar a tua conta clicando no bot\xe3o abaixo.
              </p>

              <!-- Bot\xe3o CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0"
                     style="margin:0 0 28px;">
                <tr>
                  <td align="center">
                    <a href="${r}"
                       style="display:inline-block;padding:14px 36px;
                              background:#F28C28;color:#ffffff;
                              font-size:15px;font-weight:700;
                              text-decoration:none;border-radius:8px;
                              letter-spacing:0.3px;">
                      Ativar Conta
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Aviso de expira\xe7\xe3o -->
              <p style="margin:0 0 20px;font-size:13px;color:#888;line-height:1.5;
                        padding:12px 16px;background:#f8f9fa;border-radius:6px;
                        border-left:3px solid #F28C28;">
                ⚠️ Este link expira em <strong>${a} horas</strong>.
                Se n\xe3o ativares a conta dentro deste prazo, pede ao administrador que
                envie um novo convite.
              </p>

              <!-- Fallback URL -->
              <p style="margin:0 0 8px;font-size:12px;color:#aaa;line-height:1.5;">
                Se o bot\xe3o n\xe3o funcionar, copia e cola este link no browser:
              </p>
              <p style="margin:0;font-size:12px;word-break:break-all;">
                <a href="${r}" style="color:#1E3A5F;">${r}</a>
              </p>

            </td>
          </tr>

          <!-- Separador -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #eee;margin:0;" />
            </td>
          </tr>

          <!-- Rodap\xe9 -->
          <tr>
            <td style="padding:20px 40px 28px;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:#bbb;">
                Recebeste este email porque a tua conta foi criada na plataforma HoopHub.
              </p>
              <p style="margin:0;font-size:12px;color:#bbb;">
                Se n\xe3o reconheces este registo, ignora este email.
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

        <!-- Footer externo -->
        <p style="margin:20px 0 0;font-size:11px;color:#aaa;text-align:center;">
          \xa9 ${new Date().getFullYear()} HoopHub \xb7 Todos os direitos reservados
        </p>

      </td>
    </tr>
  </table>

</body>
</html>`;return{subject:n,html:l,text:`Bem-vindo \xe0 HoopHub, ${i}!

A tua conta foi criada. Para a ativares, acede ao link abaixo:
${r}

Este link expira em ${a} horas.

Se n\xe3o reconheces este registo, ignora este email.
`}}({name:e.name,activationLink:t,appUrl:o,expiresHours:24}),l=!!process.env.RESEND_API_KEY,c=!!(process.env.GMAIL_USER||process.env.SMTP_HOST);if(l){let t;try{let o=await s({to:e.to,subject:r,html:a,text:n});if(o.success)return o;t=o.error,console.error("[email] Resend falhou:",o.error)}catch(e){console.error("[email] Resend erro:",t=e instanceof Error?e.message:String(e))}if(!c)return{success:!1,error:t??"Erro desconhecido ao enviar via Resend"}}if(c)try{let t=await i({to:e.to,subject:r,html:a,text:n});if(t.success)return console.log(`[email] Enviado via ${process.env.GMAIL_USER?"Gmail":"SMTP"} → ${e.to}`),t;return console.error("[email] Nodemailer falhou:",t.error),t}catch(t){let e=t instanceof Error?t.message:String(t);return console.error("[email] Nodemailer erro:",e),{success:!1,error:e}}return console.log("\n"+"=".repeat(60)),console.log("[EMAIL DEV] Nenhum servi\xe7o de email configurado"),console.log(`  Para:    ${e.to}`),console.log(`  Assunto: ${r}`),console.log(`  Link:    ${t}`),console.log("=".repeat(60)+"\n"),{success:!0,devFallback:!0}}},3295:e=>{"use strict";e.exports=require("next/dist/server/app-render/after-task-async-storage.external.js")},10846:e=>{"use strict";e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},13164:(e,t,r)=>{"use strict";r.r(t),r.d(t,{patchFetch:()=>E,routeModule:()=>h,serverHooks:()=>S,workAsyncStorage:()=>v,workUnitAsyncStorage:()=>b});var o={};r.r(o),r.d(o,{POST:()=>m,runtime:()=>x});var a=r(96559),s=r(48088),i=r(37719),n=r(32190),l=r(34386),c=r(58329),p=r(44999),u=r(76188),d=r(1163);let x="nodejs";async function f(){let e=await (0,p.UL)(),t=(0,l.createServerClient)("https://uhszagzrhdfzpfztuati.supabase.co","eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoc3phZ3pyaGRmenBmenR1YXRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5Mjc0OTUsImV4cCI6MjA5NzUwMzQ5NX0.Txv7fFu_WuXO-YZjMgBOyT9NDHqZUxgER88TMa_pfLQ",{cookies:{getAll:()=>e.getAll(),setAll:()=>{}}}),{data:{user:r}}=await t.auth.getUser();return r}function g(e,t=400){return n.NextResponse.json({error:e},{status:t})}async function m(e){let t,r=await f();if(!r)return g("N\xe3o autenticado",401);try{t=await e.json()}catch{return g("JSON inv\xe1lido")}let{userId:o,resendEmail:a=!1}=t;if(!o)return g("userId \xe9 obrigat\xf3rio");let s=function(){let e=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!e)throw Error("SUPABASE_SERVICE_ROLE_KEY n\xe3o configurada");return(0,c.UU)("https://uhszagzrhdfzpfztuati.supabase.co",e,{auth:{persistSession:!1}})}(),{data:i}=await s.from("users").select("role").eq("id",r.id).single();if(!i||!["admin","treinador"].includes(i.role))return g("Sem permiss\xe3o",403);let{data:l}=await s.from("users").select("id, email, name, active, role").eq("id",o).single();if(!l)return g("Utilizador n\xe3o encontrado",404);if("jogador"!==l.role)return g("Apenas jogadores precisam de link de ativa\xe7\xe3o",400);if(l.active)return g("A conta j\xe1 est\xe1 ativa. N\xe3o \xe9 necess\xe1rio um link de ativa\xe7\xe3o.",400);let p=(0,u.yT)(o),x=(0,u.DP)(p),m=new Date(Date.now()+u.AI).toISOString();await s.from("user_activation_tokens").insert({user_id:o,token:p,expires_at:m});let h=!1,v=!1,b=null;if(a){let e=await (0,d.X)({to:l.email,name:l.name,activationToken:p});v=e.devFallback??!1,h=e.success&&!v,b=e.error??null}return console.log(`[activation-link] Novo link para ${l.email}: ${x}`),n.NextResponse.json({activationLink:x,expiresAt:m,emailSent:h,emailDevFallback:v,emailError:b})}let h=new a.AppRouteRouteModule({definition:{kind:s.RouteKind.APP_ROUTE,page:"/api/admin/users/activation-link/route",pathname:"/api/admin/users/activation-link",filename:"route",bundlePath:"app/api/admin/users/activation-link/route"},resolvedPagePath:"G:\\Reposit\xf3rios\\cdpovoamasters\\web\\app\\api\\admin\\users\\activation-link\\route.ts",nextConfigOutput:"",userland:o}),{workAsyncStorage:v,workUnitAsyncStorage:b,serverHooks:S}=h;function E(){return(0,i.patchFetch)({workAsyncStorage:v,workUnitAsyncStorage:b})}},21820:e=>{"use strict";e.exports=require("os")},27910:e=>{"use strict";e.exports=require("stream")},28354:e=>{"use strict";e.exports=require("util")},29021:e=>{"use strict";e.exports=require("fs")},29294:e=>{"use strict";e.exports=require("next/dist/server/app-render/work-async-storage.external.js")},33873:e=>{"use strict";e.exports=require("path")},34631:e=>{"use strict";e.exports=require("tls")},37366:e=>{"use strict";e.exports=require("dns")},44870:e=>{"use strict";e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},55511:e=>{"use strict";e.exports=require("crypto")},55591:e=>{"use strict";e.exports=require("https")},63033:e=>{"use strict";e.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},74075:e=>{"use strict";e.exports=require("zlib")},76188:(e,t,r)=>{"use strict";r.d(t,{AI:()=>a,DP:()=>l,Ju:()=>n,yT:()=>i});var o=r(55511);let a=864e5;function s(){let e=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!e)throw Error("SUPABASE_SERVICE_ROLE_KEY n\xe3o configurada");return e}function i(e){let t=Date.now()+a,r=`${e}:${t}`,i=(0,o.createHmac)("sha256",s()).update(r).digest("hex");return Buffer.from(`${r}:${i}`).toString("base64url")}function n(e){try{let t=Buffer.from(e,"base64url").toString("utf8"),r=t.lastIndexOf(":");if(-1===r)return{ok:!1,reason:"invalid"};let a=t.slice(0,r),i=t.slice(r+1),n=a.indexOf(":");if(-1===n)return{ok:!1,reason:"invalid"};let l=a.slice(0,n),c=Number(a.slice(n+1));if(!l||isNaN(c))return{ok:!1,reason:"invalid"};let p=(0,o.createHmac)("sha256",s()).update(a).digest("hex"),u=Buffer.from(i,"hex"),d=Buffer.from(p,"hex");if(u.length!==d.length||!(0,o.timingSafeEqual)(u,d))return{ok:!1,reason:"invalid"};if(Date.now()>c)return{ok:!1,reason:"expired"};return{ok:!0,userId:l}}catch{return{ok:!1,reason:"invalid"}}}function l(e){return`http://localhost:3000/activate?token=${e}`}},78335:()=>{},79551:e=>{"use strict";e.exports=require("url")},79646:e=>{"use strict";e.exports=require("child_process")},81630:e=>{"use strict";e.exports=require("http")},91645:e=>{"use strict";e.exports=require("net")},94735:e=>{"use strict";e.exports=require("events")},96487:()=>{}};var t=require("../../../../../webpack-runtime.js");t.C(e);var r=e=>t(t.s=e),o=t.X(0,[4447,8329,3410,580],()=>r(13164));module.exports=o})();