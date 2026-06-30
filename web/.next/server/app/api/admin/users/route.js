(()=>{var e={};e.id=6950,e.ids=[6950],e.modules={1163:(e,r,t)=>{"use strict";t.d(r,{X:()=>n});let a="http://localhost:3000",o="HoopHub";async function i(e){let{Resend:r}=await t.e(1846).then(t.bind(t,91846)),a=`${o} <${process.env.RESEND_FROM_EMAIL??"noreply@hoophub.app"}>`,i=new r(process.env.RESEND_API_KEY),{data:s,error:n}=await i.emails.send({from:a,to:e.to,subject:e.subject,html:e.html,text:e.text});return n?{success:!1,error:n.message}:{success:!0,messageId:s?.id}}async function s(e){let r,a,i=await t.e(9526).then(t.t.bind(t,49526,19));if(process.env.GMAIL_USER&&process.env.GMAIL_APP_PASSWORD)r=i.createTransport({service:"gmail",auth:{user:process.env.GMAIL_USER,pass:process.env.GMAIL_APP_PASSWORD}}),a=`${o} <${process.env.GMAIL_USER}>`;else{if(!process.env.SMTP_HOST)return{success:!1,error:"Nenhum transporte SMTP configurado"};r=i.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT??587),secure:"true"===process.env.SMTP_SECURE,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}}),a=`${o} <${process.env.SMTP_FROM??process.env.SMTP_USER??"noreply@hoophub.app"}>`}return{success:!0,messageId:(await r.sendMail({from:a,to:e.to,subject:e.subject,html:e.html,text:e.text})).messageId}}async function n(e){let r=`${a}/activate?token=${e.activationToken}`,{subject:t,html:o,text:n}=function(e){let{name:r,activationLink:t,appUrl:a,expiresHours:o=24}=e,i=`${a}/assets/logo/hoophub.png`,s=r.split(" ")[0],n="Ativa a tua conta HoopHub",l=`<!DOCTYPE html>
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
                src="${i}"
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
                Bem-vindo \xe0 HoopHub, ${s}!
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
                    <a href="${t}"
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
                ⚠️ Este link expira em <strong>${o} horas</strong>.
                Se n\xe3o ativares a conta dentro deste prazo, pede ao administrador que
                envie um novo convite.
              </p>

              <!-- Fallback URL -->
              <p style="margin:0 0 8px;font-size:12px;color:#aaa;line-height:1.5;">
                Se o bot\xe3o n\xe3o funcionar, copia e cola este link no browser:
              </p>
              <p style="margin:0;font-size:12px;word-break:break-all;">
                <a href="${t}" style="color:#1E3A5F;">${t}</a>
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
</html>`;return{subject:n,html:l,text:`Bem-vindo \xe0 HoopHub, ${s}!

A tua conta foi criada. Para a ativares, acede ao link abaixo:
${t}

Este link expira em ${o} horas.

Se n\xe3o reconheces este registo, ignora este email.
`}}({name:e.name,activationLink:r,appUrl:a,expiresHours:24}),l=!!process.env.RESEND_API_KEY,d=!!(process.env.GMAIL_USER||process.env.SMTP_HOST);if(l){let r;try{let a=await i({to:e.to,subject:t,html:o,text:n});if(a.success)return a;r=a.error,console.error("[email] Resend falhou:",a.error)}catch(e){console.error("[email] Resend erro:",r=e instanceof Error?e.message:String(e))}if(!d)return{success:!1,error:r??"Erro desconhecido ao enviar via Resend"}}if(d)try{let r=await s({to:e.to,subject:t,html:o,text:n});if(r.success)return console.log(`[email] Enviado via ${process.env.GMAIL_USER?"Gmail":"SMTP"} → ${e.to}`),r;return console.error("[email] Nodemailer falhou:",r.error),r}catch(r){let e=r instanceof Error?r.message:String(r);return console.error("[email] Nodemailer erro:",e),{success:!1,error:e}}return console.log("\n"+"=".repeat(60)),console.log("[EMAIL DEV] Nenhum servi\xe7o de email configurado"),console.log(`  Para:    ${e.to}`),console.log(`  Assunto: ${t}`),console.log(`  Link:    ${r}`),console.log("=".repeat(60)+"\n"),{success:!0,devFallback:!0}}},3295:e=>{"use strict";e.exports=require("next/dist/server/app-render/after-task-async-storage.external.js")},10846:e=>{"use strict";e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},21820:e=>{"use strict";e.exports=require("os")},27910:e=>{"use strict";e.exports=require("stream")},28354:e=>{"use strict";e.exports=require("util")},29021:e=>{"use strict";e.exports=require("fs")},29294:e=>{"use strict";e.exports=require("next/dist/server/app-render/work-async-storage.external.js")},33873:e=>{"use strict";e.exports=require("path")},34631:e=>{"use strict";e.exports=require("tls")},37366:e=>{"use strict";e.exports=require("dns")},44870:e=>{"use strict";e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},55511:e=>{"use strict";e.exports=require("crypto")},55591:e=>{"use strict";e.exports=require("https")},63033:e=>{"use strict";e.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},74075:e=>{"use strict";e.exports=require("zlib")},76188:(e,r,t)=>{"use strict";t.d(r,{AI:()=>o,DP:()=>l,Ju:()=>n,yT:()=>s});var a=t(55511);let o=864e5;function i(){let e=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!e)throw Error("SUPABASE_SERVICE_ROLE_KEY n\xe3o configurada");return e}function s(e){let r=Date.now()+o,t=`${e}:${r}`,s=(0,a.createHmac)("sha256",i()).update(t).digest("hex");return Buffer.from(`${t}:${s}`).toString("base64url")}function n(e){try{let r=Buffer.from(e,"base64url").toString("utf8"),t=r.lastIndexOf(":");if(-1===t)return{ok:!1,reason:"invalid"};let o=r.slice(0,t),s=r.slice(t+1),n=o.indexOf(":");if(-1===n)return{ok:!1,reason:"invalid"};let l=o.slice(0,n),d=Number(o.slice(n+1));if(!l||isNaN(d))return{ok:!1,reason:"invalid"};let u=(0,a.createHmac)("sha256",i()).update(o).digest("hex"),c=Buffer.from(s,"hex"),p=Buffer.from(u,"hex");if(c.length!==p.length||!(0,a.timingSafeEqual)(c,p))return{ok:!1,reason:"invalid"};if(Date.now()>d)return{ok:!1,reason:"expired"};return{ok:!0,userId:l}}catch{return{ok:!1,reason:"invalid"}}}function l(e){return`http://localhost:3000/activate?token=${e}`}},78335:()=>{},79551:e=>{"use strict";e.exports=require("url")},79646:e=>{"use strict";e.exports=require("child_process")},81630:e=>{"use strict";e.exports=require("http")},91645:e=>{"use strict";e.exports=require("net")},94735:e=>{"use strict";e.exports=require("events")},96487:()=>{},98611:(e,r,t)=>{"use strict";t.r(r),t.d(r,{patchFetch:()=>k,routeModule:()=>_,serverHooks:()=>R,workAsyncStorage:()=>y,workUnitAsyncStorage:()=>A});var a={};t.r(a),t.d(a,{DELETE:()=>E,GET:()=>b,PATCH:()=>S,POST:()=>w,runtime:()=>m});var o=t(96559),i=t(48088),s=t(37719),n=t(32190),l=t(34386),d=t(58329),u=t(44999),c=t(76188),p=t(1163);let m="nodejs";function g(){let e=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!e)throw Error("SUPABASE_SERVICE_ROLE_KEY n\xe3o configurada");return(0,d.UU)("https://uhszagzrhdfzpfztuati.supabase.co",e,{auth:{persistSession:!1}})}async function f(){let e=await (0,u.UL)(),r=(0,l.createServerClient)("https://uhszagzrhdfzpfztuati.supabase.co","eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoc3phZ3pyaGRmenBmenR1YXRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5Mjc0OTUsImV4cCI6MjA5NzUwMzQ5NX0.Txv7fFu_WuXO-YZjMgBOyT9NDHqZUxgER88TMa_pfLQ",{cookies:{getAll:()=>e.getAll(),setAll:()=>{}}}),{data:{user:t}}=await r.auth.getUser();return t}function x(e,r=400){return n.NextResponse.json({error:e},{status:r})}let h=/^(\+351)?[0-9]{9}$/,v=/^\d{4}-\d{2}-\d{2}$/;async function b(){let e=await f();if(!e)return x("N\xe3o autenticado",401);let r=g(),{data:t}=await r.from("users").select("role").eq("id",e.id).single();if(!t||!["admin","treinador"].includes(t.role))return x("Sem permiss\xe3o",403);let{data:a,error:o}=await r.from("users").select("id, email, name, role, phone, birth_date, photo_url, active, created_at").order("created_at",{ascending:!1});if(o)return x(o.message,500);let i=(a??[]).map(e=>e.id),s={};if(i.length>0){let{data:e}=await r.from("players").select("id, name, user_id, number, position, season_id").in("user_id",i);for(let r of e??[])r.user_id&&(s[r.user_id]=r)}let l=(a??[]).map(e=>({...e,player:s[e.id]??null}));return n.NextResponse.json({users:l})}async function w(e){let r,t=await f();if(!t)return x("N\xe3o autenticado",401);try{r=await e.json()}catch{return x("JSON inv\xe1lido")}let{name:a,email:o,password:i,role:s="jogador",phone:l,birth_date:d,season_id:u,jersey_number:m,position:b,height:w,weight:S}=r;if(!a?.trim())return x("Nome \xe9 obrigat\xf3rio");if(!o?.trim())return x("Email \xe9 obrigat\xf3rio");if(!i?.trim())return x("Password \xe9 obrigat\xf3ria");if(i.length<6)return x("Password deve ter pelo menos 6 caracteres");if(!["admin","treinador","jogador"].includes(s))return x("Role inv\xe1lido");if("jogador"===s){if(!u)return x("Temporada \xe9 obrigat\xf3ria para jogadores");if(!l?.trim())return x("Telem\xf3vel \xe9 obrigat\xf3rio para jogadores");if(!d?.trim())return x("Data de nascimento \xe9 obrigat\xf3ria para jogadores")}if(l?.trim()){var E;let e=(E=l.trim(),h.test(E.replace(/\s+/g,""))?null:"Telem\xf3vel inv\xe1lido. Usa 9 d\xedgitos ou +351 seguido de 9 d\xedgitos.");if(e)return x(e)}if(d?.trim()){let e=function(e){if(!v.test(e))return"Data de nascimento inv\xe1lida (formato YYYY-MM-DD).";let r=(Date.now()-new Date(e).getTime())/315576e5;return r<16?"O jogador deve ter pelo menos 16 anos.":r>100?"Data de nascimento inv\xe1lida.":null}(d.trim());if(e)return x(e)}let _=g(),{data:y}=await _.from("users").select("role").eq("id",t.id).single();if(!y||!["admin","treinador"].includes(y.role))return x("Sem permiss\xe3o — apenas admin ou treinador podem criar contas",403);if("treinador"===y.role&&"jogador"!==s)return x("Treinadores s\xf3 podem criar contas de jogador",403);let{data:A,error:R}=await _.auth.admin.createUser({email:o.trim(),password:i.trim(),email_confirm:!0,user_metadata:{name:a.trim()}});if(R)return R.message.includes("already registered")?x("Este email j\xe1 tem uma conta registada",409):x(`Erro ao criar utilizador: ${R.message}`,500);let k=A.user.id,j={id:k,email:o.trim(),name:a.trim(),role:s,active:"jogador"!==s};l?.trim()&&(j.phone=l.trim().replace(/\s+/g,"")),d?.trim()&&(j.birth_date=d.trim());let{error:T}=await _.from("users").insert(j);if(T)return await _.auth.admin.deleteUser(k),x(`Erro ao criar perfil: ${T.message}`,500);let P=null,I=null;if("jogador"===s&&u){let e={name:a.trim(),season_id:u,user_id:k};l?.trim()&&(e.phone=l.trim().replace(/\s+/g,"")),d?.trim()&&(e.birth_date=d.trim()),m?.trim()&&(e.number=Number(m)),b?.trim()&&(e.position=b.trim()),w?.trim()&&(e.height=Number(w)),S?.trim()&&(e.weight=Number(S));let{data:r,error:t}=await _.from("players").insert(e).select().single();if(t)if("23505"===t.code){let{data:e,error:r}=await _.from("players").update({user_id:k,...m?.trim()?{number:Number(m)}:{},...b?.trim()?{position:b.trim()}:{}}).eq("name",a.trim()).eq("season_id",u).is("user_id",null).select().single();r||!e?(I="J\xe1 existe um jogador com este nome nesta temporada, associado a outra conta. Liga manualmente em Gest\xe3o de Jogadores.",console.error("[api/admin/users] Conflito ao ligar jogador:",r?.message??t.message)):(P=e,console.log("[api/admin/users] Jogador existente ligado \xe0 nova conta:",e.id))}else I=t.message,console.error("[api/admin/users] Erro ao criar jogador:",t.message);else P=r}let $=null,q=!1,M=!1,N=null;if("jogador"===s){let e=(0,c.yT)(k);$=(0,c.DP)(e);let r=new Date(Date.now()+864e5).toISOString(),{error:t}=await _.from("user_activation_tokens").insert({user_id:k,token:e,expires_at:r});t&&console.warn("[api/admin/users] Token DB save skipped:",t.message);let i=await (0,p.X)({to:o.trim(),name:a.trim(),activationToken:e});M=i.devFallback??!1,q=i.success&&!M,N=i.error??null,console.log(`[api/admin/users] Link de ativa\xe7\xe3o para ${o.trim()}:`),console.log(`  ${$}`)}return n.NextResponse.json({success:!0,user:{id:k,email:o.trim(),name:a.trim(),role:s},player:P,playerError:I,activation:"jogador"===s?{activationLink:$,emailSent:q,emailDevFallback:M,emailError:N}:null},{status:201})}async function S(e){let r,t=await f();if(!t)return x("N\xe3o autenticado",401);try{r=await e.json()}catch{return x("JSON inv\xe1lido")}let{user_id:a,role:o,active:i,name:s}=r;if(!a)return x("user_id \xe9 obrigat\xf3rio");let l=g(),{data:d}=await l.from("users").select("role").eq("id",t.id).single();if(d?.role!=="admin")return x("Apenas o administrador pode alterar contas",403);let u={};if(void 0!==s&&String(s).trim()&&(u.name=String(s).trim()),void 0!==o){if(!["admin","treinador","jogador"].includes(String(o)))return x("Role inv\xe1lido");u.role=o}if(void 0!==i&&(u.active=!!i),0===Object.keys(u).length)return x("Nenhum campo para actualizar");let{error:c}=await l.from("users").update(u).eq("id",a);return c?x(c.message,500):n.NextResponse.json({success:!0})}async function E(e){let r=await f();if(!r)return x("N\xe3o autenticado",401);let{searchParams:t}=new URL(e.url),a=t.get("id");if(!a)return x("id \xe9 obrigat\xf3rio");if(a===r.id)return x("N\xe3o podes eliminar a tua pr\xf3pria conta",400);let o=g(),{data:i}=await o.from("users").select("role").eq("id",r.id).single();if(i?.role!=="admin")return x("Apenas o administrador pode eliminar contas",403);let{data:s}=await o.from("users").select("id").eq("id",a).single();if(!s)return x("Utilizador n\xe3o encontrado",404);await o.from("players").delete().eq("user_id",a);let{error:l}=await o.from("users").delete().eq("id",a);if(l)return x(`Erro ao eliminar perfil: ${l.message}`,500);let{error:d}=await o.auth.admin.deleteUser(a);return d&&console.error("[DELETE /api/admin/users] Auth delete failed:",d.message),n.NextResponse.json({success:!0,message:"Conta eliminada."})}let _=new o.AppRouteRouteModule({definition:{kind:i.RouteKind.APP_ROUTE,page:"/api/admin/users/route",pathname:"/api/admin/users",filename:"route",bundlePath:"app/api/admin/users/route"},resolvedPagePath:"G:\\Reposit\xf3rios\\cdpovoamasters\\web\\app\\api\\admin\\users\\route.ts",nextConfigOutput:"",userland:a}),{workAsyncStorage:y,workUnitAsyncStorage:A,serverHooks:R}=_;function k(){return(0,s.patchFetch)({workAsyncStorage:y,workUnitAsyncStorage:A})}}};var r=require("../../../../webpack-runtime.js");r.C(e);var t=e=>r(r.s=e),a=r.X(0,[4447,8329,3410,580],()=>t(98611));module.exports=a})();