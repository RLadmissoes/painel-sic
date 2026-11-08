/* Relatórios do Painel SIC: Planejamento semanal e Fechamento semanal.
   Recebe as tarefas já lidas da exportação do Planner e devolve HTML pronto para imprimir em A4. */
(function(){
"use strict";
const dn = (y,m,d) => Math.floor(Date.UTC(y,m-1,d)/864e5);
const fromDn = n => { const t = new Date(n*864e5); return {y:t.getUTCFullYear(), m:t.getUTCMonth()+1, d:t.getUTCDate(), w:t.getUTCDay()}; };
const pad = n => String(n).padStart(2,"0");
const fmt = n => { if(n==null) return "—"; const a=fromDn(n); return `${pad(a.d)}/${pad(a.m)}/${a.y}`; };
const fmtS = n => { if(n==null) return "—"; const a=fromDn(n); return `${pad(a.d)}/${pad(a.m)}`; };
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const isDone = t => /conclu/i.test(t.status);
const st3 = t => isDone(t) ? "done" : (/andamento/i.test(t.status) ? "prog" : "ns");
const ST = {done:"Concluída", prog:"Em andamento", ns:"Não iniciada"};
const isoWeek = n => { const thu = n - ((fromDn(n).w + 6) % 7) + 3; const y = fromDn(thu).y; return {week: 1 + Math.floor((thu - dn(y,1,1)) / 7), year: y}; };
/* Semana do SIC: segunda a domingo (semana ISO) */
function sicWeek(anyDay){
  const mon = anyDay - ((fromDn(anyDay).w + 6) % 7);
  return { start: mon, end: mon + 6, ...isoWeek(mon) };
}
/* atraso médio (dias) das entregas concluídas depois do prazo */
function delayStats(list){
  const withDue = list.filter(t => t.doneOn != null && t.due != null);
  const late = withDue.map(t => t.doneOn - t.due).filter(d => d > 0).sort((a,b)=>a-b);
  const mean = late.length ? late.reduce((a,b)=>a+b,0) / late.length : 0;
  const allMean = withDue.length ? withDue.reduce((a,t)=>a+Math.max(0,t.doneOn-t.due),0) / withDue.length : 0;
  return { n: withDue.length, late: late.length, mean, allMean, median: late.length ? late[Math.floor(late.length/2)] : 0 };
}
const dTxt = v => v ? (Math.round(v*10)/10).toString().replace(".",",") + " d" : "0 d";
const PRIO = p => /urgente/i.test(p) ? "P1" : /importante/i.test(p) ? "P2" : "P3";
const ROUTINE = /atividades di[áa]rias|reuni[õo]es/i;
const overlaps = (t,s,e) => { const a = t.start ?? t.due, b = t.due ?? t.start; return a != null && a <= e && b >= s; };
const proj = t => t.labels && t.labels.length ? t.labels.join(" / ") : "—";

function css(){ return `
.rel{font-family:"IBM Plex Sans",Arial,sans-serif;color:#10283A;font-size:10.5px;line-height:1.38;background:#fff}
.rel .pg{width:186mm;margin:0 auto}
.rel .hd{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;border-bottom:3px solid #025D8A;padding-bottom:8px}
.rel .hd img{height:48px}
.rel .hd .co{font-family:"Barlow Condensed",Arial Narrow,sans-serif;letter-spacing:.14em;text-transform:uppercase;font-weight:600;font-size:12px;color:#45606F;line-height:1.3}
.rel .hd .co b{display:block;color:#025D8A;font-size:19px;letter-spacing:.06em;font-weight:700}
.rel .hd .wk{text-align:right;font-family:"Barlow Condensed",Arial Narrow,sans-serif;line-height:1}
.rel .hd .wk small{display:block;font-size:9px;letter-spacing:.12em;color:#6F8794;font-family:"IBM Plex Sans",Arial,sans-serif;font-weight:600}
.rel .hd .wk strong{font-size:38px;color:#025D8A}
.rel .meta{display:flex;flex-wrap:wrap;gap:2px 16px;font-size:9.5px;color:#45606F;margin:6px 0 10px}
.rel .meta b{color:#10283A}
.rel h2{margin:12px 0 0;background:#025D8A;color:#fff;font-family:"Barlow Condensed",Arial Narrow,sans-serif;font-weight:600;font-size:13px;letter-spacing:.16em;text-transform:uppercase;padding:4px 8px;break-after:avoid}
.rel table{width:100%;border-collapse:collapse;table-layout:fixed}
.rel th,.rel td{border:1px solid #B9CCD5;padding:5px 7px;vertical-align:top;text-align:left;overflow-wrap:anywhere}
.rel th{background:#DDEEF4;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#025D8A;font-weight:700}
.rel td.lb{background:#EEF4F6;font-weight:600;color:#10283A}
.rel tr{break-inside:avoid}
.rel h2+table thead{break-before:avoid}
.rel .c{text-align:center}
.rel .p1,.rel .p2,.rel .p3{display:inline-block;min-width:24px;text-align:center;border-radius:4px;font-weight:700;font-size:10px;padding:1px 4px}
.rel .p1{background:#E8890C;color:#10283A} .rel .p1::before{content:"! "} .rel .p2{background:#5FB3E0;color:#06212E} .rel .p3{background:#fff;color:#025D8A;box-shadow:inset 0 0 0 1px #025D8A}
.rel .late{color:#A35400;font-weight:700}
.rel .muted{color:#6F8794}
.rel .tag{display:inline-block;font-size:8.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;border-radius:3px;padding:0 4px;margin-left:4px;vertical-align:1px}
.rel .tag.ns{background:#fff;color:#45606F;box-shadow:inset 0 0 0 1px #6F8794} .rel .tag.prog{background:#5FB3E0;color:#06212E} .rel .tag.done{background:#0B4A7A;color:#fff} .rel .tag.done::before{content:"✓ "} .rel .tag.lt{background:#E8890C;color:#10283A}
.rel ul{margin:0;padding-left:14px} .rel li{margin:1px 0}
.rel .obj{min-height:44px}
.rel .box{height:70px}
.rel .kp{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:6px}
.rel .kp div{border:1px solid #B9CCD5;border-radius:6px;padding:6px 8px}
.rel .kp b{display:block;font-family:"Barlow Condensed",Arial Narrow,sans-serif;font-size:24px;line-height:1;color:#025D8A}
.rel .kp span{font-size:8.5px;letter-spacing:.06em;text-transform:uppercase;color:#45606F;font-weight:600}
.rel .meter{height:7px;background:#E0EBEF;border-radius:4px;overflow:hidden;margin-top:3px}
.rel .meter i{display:block;height:100%;background:#0B4A7A}
.rel .ft{margin-top:12px;border-top:1px solid #B9CCD5;padding-top:5px;font-size:8.5px;color:#6F8794;display:flex;justify-content:space-between;gap:10px}
.rel .sig{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:26px;font-size:9.5px;color:#45606F;text-align:center}
.rel .sig div{border-top:1px solid #10283A;padding-top:4px}
`; }

function header(o, title, wk){
  return `<div class="hd"><img src="${o.logo||"logo.png"}" alt="Ribeiro Lopes">
    <div class="co">Ribeiro Lopes Consultoria e Serviços Ltda<b>${esc(title)}</b>Setor de Instalações Civis · SIC</div>
    <div class="wk"><small>SEMANA</small><strong>${pad(wk.week)}</strong><small>${fmtS(wk.start)} A ${fmt(wk.end)}</small></div></div>
  <div class="meta"><span>Coordenação: <b>${esc(o.coord||"—")}</b></span><span>Gerado em <b>${o.now.toLocaleDateString("pt-BR")}</b> às <b>${o.now.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</b></span><span>Planner exportado em <b>${fmt(o.exported)}</b></span>${o.bucketsTxt?`<span>Buckets: <b>${esc(o.bucketsTxt)}</b></span>`:""}</div>`;
}
const footer = (o, txt) => `<div class="ft"><span>${esc(txt)}</span><span>Prioridade: P1 Urgente · P2 Importante · P3 Média/Baixa (Planner ou ajuste da coordenação)</span></div>`;
const people = (t, o) => t.people.map(p => o.name(p)).join(" / ") || "—";
const cut = (x,n) => x.length > n ? x.slice(0,n-1).trim() + "…" : x;
const crit = t => { const it = (t.items||[]).filter(Boolean); const parts = [];
  if(it.length) parts.push(`<ul>${it.slice(0,4).map(i=>`<li>${esc(cut(i,70))}</li>`).join("")}${it.length>4?`<li class="muted">+${it.length-4} itens</li>`:""}</ul>`);
  if(t.notes) parts.push(`<div class="muted">${esc(cut(t.notes,140))}</div>`);
  return parts.join("") || `<span class="muted">Sem critério no Planner (lista de verificação vazia).</span>`; };
const marco = (t, wk) => t.due == null ? "—" : (t.due < wk.start && !isDone(t) ? `<span class="late">Vencida ${fmtS(t.due)}</span>` : fmtS(t.due));

/* ---------- PLANEJAMENTO SEMANAL ---------- */
const nl = x => esc(x||"").replace(/\n/g,"<br>");
const PORD = {P1:1,P2:2,P3:3};
/* dados do planejamento, já com os ajustes da coordenação (prioridade, marco, exclusão) e os itens fora do Planner */
function planData(tasks, o){
  const wk = sicWeek(o.day);
  const scope = tasks.filter(t => o.bucketOk(t));
  const open = scope.filter(t => !isDone(t));
  const inWeek = open.filter(t => overlaps(t, wk.start, wk.end) || (t.due != null && t.due < wk.start));
  const over = o.over || {}, manual = o.manual || [];
  const base = inWeek.filter(t => !ROUTINE.test(t.bucket||""));
  const rows = base.map(t => { const v = over[t.id] || {};
      return { id:t.id, t, manual:false, off:!!v.off, prioOrig:PRIO(t.prio), prio:v.prio || PRIO(t.prio), dueOrig:t.due, due: v.marco != null ? v.marco : t.due,
        name:t.name, proj:proj(t), people:t.people, peopleTxt:people(t,o) }; })
    .concat(manual.map((m,i) => ({ id:"m"+i, manual:true, off:false, prio:m.prio||"P2", due:m.marco ?? null, name:m.nome||"(sem nome)", proj:m.proj||"—", crit:m.crit||"",
        peopleTxt:m.resp||"—", people:o.team.filter(x => { const r = (m.resp||"").toLowerCase(); const f = (x.nome||x.planner).split(" ")[0].toLowerCase(); return r.includes(f) || /equipe/i.test(r); }).map(x => x.planner) })));
  const active = rows.filter(r => !r.off).sort((a,b) => PORD[a.prio]-PORD[b.prio] || (a.due??1e9)-(b.due??1e9) || a.proj.localeCompare(b.proj));
  return { wk, scope, open, inWeek, rows, active };
}
function autoObjetivo(d){
  const p1 = d.active.filter(r => r.prio === "P1");
  const venc = d.active.filter(r => r.due != null && r.due < d.wk.start);
  const marcos = d.active.filter(r => r.due != null && r.due >= d.wk.start && r.due <= d.wk.end);
  const projs = [...new Set(d.active.map(r => r.proj))].filter(p => p !== "—");
  const txt = [
    p1.length ? `concluir as demandas P1 (${p1.map(r=>r.name).join(", ")})` : "",
    venc.length ? `tratar ${venc.length} pendência${venc.length>1?"s":""} com prazo vencido` : "",
    marcos.length ? `cumprir ${marcos.length} marco${marcos.length>1?"s":""} até ${fmtS(d.wk.end)}` : "",
    projs.length ? `manter o andamento de ${projs.slice(0,6).join(", ")}` : ""
  ].filter(Boolean).join("; ");
  return txt ? txt[0].toUpperCase() + txt.slice(1) + "." : "";
}
function planejamento(tasks, o){
  const d = planData(tasks, o), wk = d.wk, act = d.active;
  const remanesc = act.filter(r => r.due != null && r.due < wk.start);
  const marcos = act.filter(r => r.due != null && r.due >= wk.start && r.due <= wk.end).sort((a,b)=>a.due-b.due);
  const proximos = d.open.filter(t => !ROUTINE.test(t.bucket||"") && t.due != null && t.due > wk.end && t.due <= wk.end + 14 && !act.some(r => r.id === t.id && r.due !== t.due)).sort((a,b)=>a.due-b.due);
  const team = o.team.filter(m => o.activeOn(m.planner, wk.start));
  const objetivo = o.texts.objetivo != null && o.texts.objetivo !== "" ? o.texts.objetivo : autoObjetivo(d);
  const mk = r => r.due == null ? "—" : (r.due < wk.start && !r.manual ? `<span class="late">Vencida ${fmtS(r.due)}</span>` : fmtS(r.due)) + (!r.manual && r.due !== r.dueOrig ? `<div class="muted">(Planner: ${fmtS(r.dueOrig)})</div>` : "");

  const rows = act.map(r => `<tr><td class="c"><span class="${r.prio.toLowerCase()}">${r.prio}</span></td>
      <td><b>${esc(r.proj)}</b><br>${esc(r.name)}${r.manual ? `<span class="tag ns">Fora do Planner</span>` : `<span class="tag ${st3(r.t)}">${ST[st3(r.t)]}</span>`}</td>
      <td>${esc(r.peopleTxt)}</td><td class="c">${mk(r)}</td><td>${r.manual ? (r.crit ? nl(r.crit) : `<span class="muted">—</span>`) : crit(r.t)}</td></tr>`).join("");

  const resp = team.map(m => {
    const dem = act.filter(r => r.people.includes(m.planner));
    const daily = d.inWeek.filter(t => t.people.includes(m.planner) && /atividades di[áa]rias/i.test(t.bucket||"")).flatMap(t => t.items||[]);
    const late = dem.filter(r => r.due != null && r.due < wk.start).length;
    const byP = new Map(); dem.forEach(r => byP.set(r.proj, [...(byP.get(r.proj)||[]), r]));
    const txt = [...byP].map(([p,rs]) => `<b>${esc(p)}:</b> ${rs.map(r => `${esc(r.name)} (${r.due!=null&&r.due<wk.start?`<span class="late">vencida ${fmtS(r.due)}</span>`:`até ${fmtS(r.due)}`})`).join("; ")}`).join("<br>");
    const dl = [...new Set(daily)].slice(0,5);
    return `<tr><td class="lb">${esc(m.nome||m.planner)}${m.funcao==="coord"?`<div class="muted" style="font-weight:400">Coordenador</div>`:""}</td>
      <td>${txt || `<span class="muted">Sem demandas de projeto atribuídas.</span>`}${dl.length?`<div class="muted" style="margin-top:3px">Rotina: ${dl.map(esc).join("; ")}</div>`:""}</td>
      <td class="c"><b>${dem.length}</b>${late?`<div class="late">${late} venc.</div>`:""}</td></tr>`; }).join("");

  const marcoRows = marcos.length ? marcos.map((r,i) => `<tr><td class="lb c">${fmtS(r.due)}</td><td>MARCO ${i+1} – ${esc(r.name)} <span class="muted">(${esc(r.proj)} · ${esc(r.peopleTxt)})</span></td></tr>`).join("")
    : `<tr><td class="lb c">—</td><td class="muted">Nenhuma demanda com marco dentro desta semana.</td></tr>`;
  const proxRows = proximos.map(t => `<tr><td class="lb c">${fmtS(t.due)}</td><td>${esc(t.name)} <span class="muted">(${esc(proj(t))} · ${esc(people(t,o))})</span></td></tr>`).join("");
  const ind = [...new Set(act.filter(r=>!r.manual).map(r=>r.proj))].map(p => { const ts = d.scope.filter(t => proj(t)===p && !ROUTINE.test(t.bucket||"") && (overlaps(t, wk.start, wk.end) || act.some(r => r.id === t.id))); return `${esc(p)}: concluídas/total (hoje ${ts.filter(isDone).length}/${ts.length})`; });

  return `<div class="rel"><div class="pg">
  ${header(o, "Planejamento Semanal", wk)}
  <table><tr><td class="lb" style="width:22%">Objetivo da semana</td><td class="obj">${nl(objetivo)}</td></tr></table>
  <h2>1. Matriz executiva de demandas</h2>
  <table><thead><tr><th style="width:7%">Pri.</th><th style="width:30%">Projeto / entrega</th><th style="width:17%">Responsáveis</th><th style="width:11%">Marco</th><th>Meta / critério de aceite</th></tr></thead>
  <tbody>${rows || `<tr><td colspan="5" class="muted">Sem demandas abertas nesta semana.</td></tr>`}</tbody></table>
  <h2>2. Responsabilidades e capacidade</h2>
  <table><thead><tr><th style="width:17%">Colaborador</th><th>Demandas da semana</th><th style="width:11%">Qtd.</th></tr></thead><tbody>${resp}
  <tr><td class="lb">Compatibilizações</td><td colspan="2">${nl(o.texts.compat || "—")}</td></tr></tbody></table>
  <h2>3. Marcos de controle, riscos e indicadores</h2>
  <table><tbody>${marcoRows}</tbody></table>
  ${proximos.length?`<table style="margin-top:-1px"><tbody><tr><th colspan="2">Próximos marcos (até ${fmtS(wk.end+14)})</th></tr>${proxRows}</tbody></table>`:""}
  <table style="margin-top:6px"><tbody>
    <tr><td class="lb" style="width:22%">Pendências vencidas</td><td>${remanesc.length ? remanesc.map(r => `${esc(r.name)} <span class="late">(${fmtS(r.due)})</span>`).join("; ") : "Nenhuma."}</td></tr>
    <tr><td class="lb">Riscos principais</td><td>${o.texts.riscos ? nl(o.texts.riscos) : `<span class="muted">—</span>`}</td></tr>
    <tr><td class="lb">Indicadores de fechamento</td><td>${ind.join(" | ") || "—"}</td></tr>
  </tbody></table>
  <h2>4. Observações</h2>
  <table><tr><td class="box">${nl(o.texts.obs)}</td></tr></table>
  ${footer(o, "Coordenação SIC · Controle semanal de demandas")}
  </div></div>`;
}

/* ---------- FECHAMENTO SEMANAL ---------- */
function fechamento(tasks, o){
  const wk = sicWeek(o.day);
  const scope = tasks.filter(t => o.bucketOk(t));
  const planned = scope.filter(t => overlaps(t, wk.start, wk.end) || (!isDone(t) && t.due != null && t.due < wk.start) || (t.doneOn != null && t.doneOn >= wk.start && t.doneOn <= wk.end));
  const doneW = planned.filter(t => t.doneOn != null && t.doneOn >= wk.start && t.doneOn <= wk.end);
  const dueW = planned.filter(t => !ROUTINE.test(t.bucket||"") && t.due != null && t.due >= wk.start && t.due <= wk.end);
  const onTime = dueW.filter(t => t.doneOn != null && t.doneOn <= t.due);
  const pend = planned.filter(t => !isDone(t));
  const latePend = pend.filter(t => t.due != null && t.due <= wk.end);
  const pct = (a,b) => b ? Math.round(a/b*100) : 0;
  const team = o.team.filter(m => o.activeOn(m.planner, wk.start));

  const byProj = new Map(); planned.forEach(t => { const k = proj(t); byProj.set(k, [...(byProj.get(k)||[]), t]); });
  const projRows = [...byProj].sort((a,b) => b[1].length - a[1].length).map(([p,ts]) => { const d = ts.filter(t => doneW.includes(t)).length, l = ts.filter(t => latePend.includes(t)).length;
    return `<tr><td class="lb">${esc(p)}</td><td class="c">${ts.length}</td><td class="c">${d}</td><td class="c">${ts.filter(t=>!isDone(t)).length}</td><td class="c">${l?`<span class="late">${l}</span>`:"0"}</td>
      <td>${pct(d,ts.length)}%<div class="meter"><i style="width:${pct(d,ts.length)}%"></i></div></td></tr>`; }).join("");
  const pRows = team.map(m => { const ts = planned.filter(t => t.people.includes(m.planner)); if(!ts.length) return "";
    const d = ts.filter(t => doneW.includes(t)).length, l = ts.filter(t => latePend.includes(t)).length;
    return `<tr><td class="lb">${esc(m.nome||m.planner)}</td><td class="c">${ts.length}</td><td class="c">${d}</td><td class="c">${ts.filter(t=>!isDone(t)).length}</td><td class="c">${l?`<span class="late">${l}</span>`:"0"}</td>
      <td>${pct(d,ts.length)}%<div class="meter"><i style="width:${pct(d,ts.length)}%"></i></div></td></tr>`; }).join("");
  const entregues = doneW.filter(t => !ROUTINE.test(t.bucket||"")).sort((a,b)=>a.doneOn-b.doneOn)
    .map(t => `<tr><td class="c">${fmtS(t.doneOn)}</td><td><b>${esc(proj(t))}</b> · ${esc(t.name)}${t.localDone?`<span class="tag prog">no app</span>`:""}</td><td>${esc(people(t,o))}</td><td class="c">${t.due!=null&&t.doneOn>t.due?`<span class="late">+${t.doneOn-t.due}d</span>`:"no prazo"}</td></tr>`).join("");
  const transf = pend.filter(t => !ROUTINE.test(t.bucket||"")).sort((a,b)=>(a.due??1e9)-(b.due??1e9))
    .map(t => `<tr><td class="c"><span class="${PRIO(t.prio).toLowerCase()}">${PRIO(t.prio)}</span></td><td><b>${esc(proj(t))}</b> · ${esc(t.name)}<span class="tag ${st3(t)}">${ST[st3(t)]}</span></td><td>${esc(people(t,o))}</td><td class="c">${t.due!=null&&t.due<=wk.end?`<span class="late">${fmtS(t.due)}</span>`:fmtS(t.due)}</td></tr>`).join("");
  const routineN = doneW.filter(t => ROUTINE.test(t.bucket||"")).length;
  /* planejado × realizado: planejado = já existia no Planner antes da segunda-feira */
  const work = planned.filter(t => !ROUTINE.test(t.bucket||""));
  const snap = o.snapshot && o.snapshot.ids ? new Set(o.snapshot.ids) : null;
  const pre = snap ? work.filter(t => snap.has(t.id)) : work.filter(t => t.created == null || t.created < wk.start);
  const novas = snap ? work.filter(t => !snap.has(t.id) && t.created != null && (t.created >= wk.start || t.created >= o.snapshot.day)) : work.filter(t => t.created != null && t.created >= wk.start);
  const preDone = pre.filter(t => doneW.includes(t)), preProg = pre.filter(t => !isDone(t) && st3(t)==="prog"), preNs = pre.filter(t => !isDone(t) && st3(t)==="ns"), preOld = pre.filter(t => isDone(t) && !doneW.includes(t));
  const ds = delayStats(doneW.filter(t => !ROUTINE.test(t.bucket||"")));
  const seg = (n, tot, col, lbl) => n ? `<i style="flex:${n};background:${col};color:${col==="#0B4A7A"?"#fff":"#10283A"};font-size:9px;font-weight:600;display:flex;align-items:center;justify-content:center;white-space:nowrap;overflow:hidden">${n} ${lbl}</i>` : "";
  const pvr = `<h2>1. Planejado × realizado</h2>
  <table><tbody><tr><td class="lb" style="width:22%">Planejadas<br><span class="muted" style="font-weight:400">${pre.length} no início da semana</span></td><td>
    <div data-chart="${esc(JSON.stringify({type:"stack", segs:[[preDone.length,"#0B4A7A","entregues"],[preProg.length,"#5FB3E0","em andamento"],[preNs.length,"#C9D6DE","não iniciadas"],[preOld.length,"#9DB3BF","já concluídas antes"]].filter(x=>x[0])}))}" style="display:flex;gap:2px;height:20px;border-radius:4px;overflow:hidden">${seg(preDone.length,pre.length,"#0B4A7A","entregues")}${seg(preProg.length,pre.length,"#5FB3E0","em andamento")}${seg(preNs.length,pre.length,"#C9D6DE","não iniciadas")}${seg(preOld.length,pre.length,"#9DB3BF","já concluídas antes")}</div>
    <div style="margin-top:4px"><b>${pct(preDone.length, pre.length - preOld.length)}%</b> das planejadas em aberto foram entregues na semana.</div></td></tr>
  <tr><td class="lb">Não planejadas<br><span class="muted" style="font-weight:400">criadas durante a semana</span></td><td>${novas.length ? novas.map(t => `${esc(t.name)} <span class="muted">(${esc(proj(t))}, criada ${fmtS(t.created)})</span>${isDone(t)?`<span class="tag done">Concluída</span>`:""}`).join("; ") : "Nenhuma demanda nova entrou na semana."}</td></tr></tbody></table>
  <div class="muted" style="font-size:8.5px;margin-top:3px">${snap ? `Planejadas = demandas do Planejamento da semana gerado em ${fmt(o.snapshot.day)}${o.snapshot.manual?` (+ ${o.snapshot.manual} item(ns) fora do Planner, não contados aqui)`:""}.` : `Sem Planejamento salvo para esta semana: "planejada" = já existia no Planner antes de ${fmtS(wk.start)}.`}</div>`;
  const hdr = `<thead><tr><th style="width:30%"></th><th>Previstas</th><th>Concluídas</th><th>Em aberto</th><th>Vencidas</th><th style="width:22%">% concluído</th></tr></thead>`;

  return `<div class="rel"><div class="pg">
  ${header(o, "Fechamento Semanal", wk)}
  <div class="kp" style="grid-template-columns:repeat(6,1fr)">
    <div><b>${planned.length}</b><span>Previstas</span></div>
    <div><b style="color:#0B4A7A">${doneW.length}</b><span>Concluídas na semana</span></div>
    <div><b>${pct(doneW.length, planned.length)}%</b><span>Taxa de conclusão</span></div>
    <div><b>${novas.length}</b><span>Não planejadas</span></div>
    <div><b style="color:${ds.mean?"#45606F":"#0B4A7A"}">${dTxt(ds.mean)}</b><span>Atraso médio (${ds.late}/${ds.n} atrasadas)</span></div>
    <div><b style="color:#A35400">${latePend.length}</b><span>Vencidas em aberto</span></div>
  </div>
  ${pvr}
  <h2>2. Indicadores por projeto</h2><table>${hdr}<tbody>${projRows}</tbody></table>
  <h2>3. Indicadores por colaborador</h2><table>${hdr}<tbody>${pRows}</tbody></table>
  <h2>4. Entregas concluídas na semana</h2>
  <table><thead><tr><th style="width:9%">Data</th><th>Projeto · entrega</th><th style="width:22%">Responsáveis</th><th style="width:11%">Prazo</th></tr></thead>
  <tbody>${entregues || `<tr><td colspan="4" class="muted">Nenhuma entrega de projeto concluída.</td></tr>`}</tbody></table>
  ${routineN?`<div class="muted" style="margin-top:3px">+ ${routineN} atividades de rotina (diárias e reuniões) concluídas.</div>`:""}
  <h2>5. Pendências transferidas para a semana ${pad(isoWeek(wk.end+7).week)}</h2>
  <table><thead><tr><th style="width:7%">Pri.</th><th>Projeto · entrega</th><th style="width:22%">Responsáveis</th><th style="width:11%">Prazo</th></tr></thead>
  <tbody>${transf || `<tr><td colspan="4" class="muted">Sem pendências.</td></tr>`}</tbody></table>
  <h2>6. Observações da coordenação</h2>
  <table><tr><td class="box">${nl(o.texts.obsFech)}</td></tr></table>
  <div class="sig"><div>${esc(o.coord||"Coordenação SIC")}<br>Coordenador SIC</div><div>Data de fechamento: ${fmt(wk.end)}</div></div>
  ${footer(o, "Coordenação SIC · Fechamento semanal de demandas")}
  </div></div>`;
}


/* ---------- utilidades dos relatórios extras ---------- */
const MES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const monthRange = day => { const a = fromDn(day); const s = dn(a.y,a.m,1); const e = dn(a.m===12?a.y+1:a.y, a.m===12?1:a.m+1, 1) - 1; return [s,e,`${MES[a.m-1]} de ${a.y}`]; };
const pctN = (a,b) => b ? Math.round(a/b*100) : 0;
const kpis = arr => `<div class="kp" style="grid-template-columns:repeat(${arr.length},1fr)">${arr.map(([n,l,c]) => `<div><b${c?` style="color:${c}"`:""}>${n}</b><span>${l}</span></div>`).join("")}</div>`;
function weekBars(list, s, e, title){
  const mons = []; for(let w = s - ((fromDn(s).w+6)%7); w <= e; w += 7) mons.push(w);
  const v = mons.map(w => list.filter(t => t.doneOn != null && t.doneOn >= Math.max(w,s) && t.doneOn <= Math.min(w+6,e)).length);
  const mx = Math.max(1, ...v);
  const cd = esc(JSON.stringify({type:"bars", title, labels:mons.map(w=>"S"+isoWeek(w).week), subs:mons.map(w=>fmtS(Math.max(w,s))), values:v}));
  return `<div data-chart="${cd}" style="border:1px solid #B9CCD5;border-radius:6px;padding:8px 10px;margin-top:6px"><div style="font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#025D8A;font-weight:700;margin-bottom:6px">${esc(title)}</div>
    <div style="display:flex;align-items:flex-end;gap:10px;height:104px;padding-top:6px">${mons.map((w,i) => `<div style="flex:1;text-align:center;font-size:9px;color:#45606F">
      <div style="font-weight:600;color:#10283A">${v[i]}</div><div style="height:${Math.round(60*v[i]/mx)}px;background:#61B4C6;border-radius:3px 3px 0 0;margin:2px auto 0;width:70%"></div>
      <div style="border-top:1px solid #B9CCD5;padding-top:2px">S${isoWeek(w).week}<br><span class="muted">${fmtS(Math.max(w,s))}</span></div></div>`).join("")}</div></div>`;
}
const appTag = t => t.localDone ? `<span class="tag prog">no app</span>` : "";
const doneRow = (t,o) => `<tr><td class="c">${fmtS(t.doneOn)}</td><td><b>${esc(proj(t))}</b> · ${esc(t.name)}${appTag(t)}</td><td>${esc(people(t,o))}</td><td class="c">${t.due!=null&&t.doneOn>t.due?`<span class="late">+${t.doneOn-t.due}d</span>`:"no prazo"}</td></tr>`;
const openRow = (t,o,ref) => `<tr><td class="c"><span class="${PRIO(t.prio).toLowerCase()}">${PRIO(t.prio)}</span></td><td><b>${esc(proj(t))}</b> · ${esc(t.name)}<span class="tag ${st3(t)}">${ST[st3(t)]}</span></td><td>${esc(people(t,o))}</td><td class="c">${t.due!=null&&t.due<ref?`<span class="late">${fmtS(t.due)}</span>`:fmtS(t.due)}</td></tr>`;
const hdrMini = (o, title, big, small, sub) => `<div class="hd"><img src="${o.logo||"logo.png"}" alt="Ribeiro Lopes">
    <div class="co">Ribeiro Lopes Consultoria e Serviços Ltda<b>${esc(title)}</b>${esc(sub)}</div>
    <div class="wk"><small>${esc(small)}</small><strong style="font-size:${String(big).length>4?24:38}px">${esc(big)}</strong></div></div>
  <div class="meta"><span>Coordenação: <b>${esc(o.coord||"—")}</b></span><span>Gerado em <b>${o.now.toLocaleDateString("pt-BR")}</b> às <b>${o.now.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</b> · semana ${pad(isoWeek(Math.floor(Date.now()/864e5)).week)}</span><span>Planner exportado em <b>${fmt(o.exported)}</b></span>${o.bucketsTxt?`<span>Buckets: <b>${esc(o.bucketsTxt)}</b></span>`:""}</div>`;

/* ---------- RELATÓRIO DE PROJETO (etapa × disciplina + linha do tempo) ---------- */
const ETAPAS = [["EST. PRELIMINAR|ESTUDO PRELIM","Estudo preliminar"],["ETP","Estudo técnico"],["ANTE","Anteprojeto"],["LISTA","Listas"],["EXE|EXEC","Executivo"],["REV","Revisão"],["PRJ","Projeto"]];
const DISC = [["HID","Hidráulico"],["SAN","Sanitário"],["INC","Incêndio"],["GLP|GASES NAT","GLP / gás natural"],["GEP|GE\\b|GASES ESP","Gases especiais"],["PLU","Pluvial"],["CLI","Climatização"],["IRRI","Irrigação"],["ETE","ETE"],["CANT","Canteiro"],["LEV|TOP|PLT TOP|PLOT-LEV","Topografia / levantamento"],["ORÇ|ORC","Orçamento"],["ELE|ELET","Elétrica"],["SPDA","SPDA"]];
const findIn = (name, list) => { const n = name.toUpperCase(); const hit = list.find(([re]) => new RegExp("(^|[-\\s.])(" + re + ")([-\\s.]|$)").test(n)); return hit ? hit[1] : null; };
function projeto(tasks, o){
  const ts = tasks.filter(t => o.bucketOk(t) && (t.labels||[]).includes(o.project)).sort((a,b)=>(a.start??a.due??0)-(b.start??b.due??0));
  const ref = Math.floor(Date.now()/864e5);
  const done = ts.filter(isDone), open = ts.filter(t=>!isDone(t)), late = open.filter(t => t.due!=null && t.due<ref);
  const onT = done.filter(t => t.due!=null && t.doneOn!=null && t.doneOn<=t.due).length;
  // matriz etapa × disciplina
  const cells = new Map(); const etUsed = new Set(), dsUsed = new Set();
  ts.forEach(t => { const et = findIn(t.name, ETAPAS), ds = findIn(t.name, DISC); if(!et || !ds) return; etUsed.add(et); dsUsed.add(ds);
    const k = et+"|"+ds; const prev = cells.get(k); if(!prev || (t.doneOn??0) > (prev.doneOn??0)) cells.set(k, t); });
  const ets = ETAPAS.map(x=>x[1]).filter(x=>etUsed.has(x)), dss = DISC.map(x=>x[1]).filter(x=>dsUsed.has(x));
  const matrix = ets.length && dss.length ? `<h2>1. Situação por disciplina e etapa</h2><table><thead><tr><th style="width:20%">Disciplina</th>${ets.map(e=>`<th class="c">${esc(e)}</th>`).join("")}</tr></thead><tbody>
    ${dss.map(d => `<tr><td class="lb">${esc(d)}</td>${ets.map(e => { const t = cells.get(e+"|"+d); if(!t) return `<td class="c muted">—</td>`;
      return isDone(t) ? `<td class="c" style="background:#DCE8F2"><b style="color:#0B4A7A">✓ ${fmtS(t.doneOn)}</b></td>` : `<td class="c" style="background:${t.due!=null&&t.due<ref?"#FBE6CC":"#EAF4FB"}"><span class="tag ${st3(t)}" style="margin:0">${ST[st3(t)]}</span><br>prazo ${fmtS(t.due)}</td>`; }).join("")}</tr>`).join("")}</tbody></table>` : "";
  // linha do tempo
  const s0 = Math.min(...ts.map(t=>t.start??t.due).filter(v=>v!=null)), e0 = Math.max(...ts.map(t=>Math.max(t.due??0,t.doneOn??0)));
  const months = []; { let a = fromDn(s0); let m = dn(a.y,a.m,1); while(m <= e0){ months.push(m); const b = fromDn(m); m = dn(b.m===12?b.y+1:b.y, b.m===12?1:b.m+1, 1); } }
  const X = v => ((v - s0) / Math.max(1, e0 - s0) * 100).toFixed(2);
  const gd = esc(JSON.stringify({type:"gantt", s0, e0, months: months.map(m => ({x:m, l:`${MES[fromDn(m).m-1].slice(0,3)}/${String(fromDn(m).y).slice(2)}`})),
    rows: ts.map(t => { const a = t.start??t.due; return {n:t.name, a, b:Math.max(t.due??a,a), d:t.doneOn, c: isDone(t) ? "#0B4A7A" : (t.due!=null&&t.due<ref ? "#E8890C" : "#5FB3E0")}; })}));
  const tl = `<h2>${matrix?"2":"1"}. Linha do tempo</h2><div data-chart="${gd}" style="border:1px solid #B9CCD5;padding:6px 8px">
    <div style="position:relative;height:14px;margin-left:34%;font-size:8.5px;color:#6F8794">${months.map(m => `<span style="position:absolute;left:${Math.max(0,X(m))}%;border-left:1px solid #B9CCD5;padding-left:3px">${MES[fromDn(m).m-1].slice(0,3)}/${String(fromDn(m).y).slice(2)}</span>`).join("")}</div>
    ${ts.map(t => { const a = t.start??t.due, b = Math.max(t.due??a, a); const col = isDone(t) ? "#0B4A7A" : (t.due!=null&&t.due<ref ? "#E8890C" : "#5FB3E0");
      return `<div style="display:grid;grid-template-columns:34% 1fr;align-items:center;font-size:9px;min-height:15px;border-top:1px solid #EEF4F6;break-inside:avoid">
        <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:6px">${esc(t.name)}</span>
        <span style="position:relative;height:9px">${months.map(m=>`<i style="position:absolute;left:${X(m)}%;top:-3px;bottom:-3px;border-left:1px dotted #D5E2E8"></i>`).join("")}
          <i style="position:absolute;left:${X(a)}%;width:calc(${X(b+1)}% - ${X(a)}%);min-width:3px;top:0;bottom:0;background:${col};opacity:.85;border-radius:2px"></i>
          ${t.doneOn!=null?`<i style="position:absolute;left:${X(t.doneOn)}%;top:-2px;bottom:-2px;width:2px;background:#10283A" title="concluída ${fmtS(t.doneOn)}"></i>`:""}</span></div>`; }).join("")}
    <div class="muted" style="font-size:8.5px;margin-top:5px">Barra: início → prazo no Planner · traço escuro: data de conclusão · azul-escuro concluída, azul-claro em aberto, laranja vencida</div></div>`;
  const ppl = new Map(); ts.forEach(t => t.people.forEach(p => ppl.set(p, (ppl.get(p)||0)+1)));
  return `<div class="rel"><div class="pg">
  ${hdrMini(o, "Relatório de Projeto", o.project, "PROJETO", `${fmt(s0)} a ${fmt(e0)} · Setor de Instalações Civis`)}
  ${kpis([[ts.length,"Tarefas"],[done.length,"Concluídas","#0B4A7A"],[open.length,"Em aberto"],[late.length,"Vencidas","#A35400"],[pctN(done.length,ts.length)+"%","Concluído"],[done.length?pctN(onT,done.length)+"%":"—","Entregues no prazo"]])}
  ${matrix}${tl}
  <h2>${matrix?"3":"2"}. Tempo de execução por etapa</h2>${leadBlock(ts, -1e9, 1e9, t => findIn(t.name, ETAPAS), "Etapa")}
  <h2>${matrix?"4":"3"}. Equipe envolvida</h2><table><tbody><tr>${[...ppl].sort((a,b)=>b[1]-a[1]).map(([p,n]) => `<td class="c"><b>${esc(o.name(p))}</b><br><span class="muted">${n} tarefa${n>1?"s":""}</span></td>`).join("")}</tr></tbody></table>
  <h2>Observações</h2><table><tr><td class="box">${nl(o.texts.obsProj)}</td></tr></table>
  ${open.length?`<h2>Pendências</h2><table><thead><tr><th style="width:7%">Pri.</th><th>Entrega</th><th style="width:24%">Responsáveis</th><th style="width:11%">Prazo</th></tr></thead><tbody>${open.map(t=>openRow(t,o,ref)).join("")}</tbody></table>`:""}
  ${footer(o, "Coordenação SIC · Relatório de projeto")}
  </div></div>`;
}

/* ---------- RELATÓRIO INDIVIDUAL (colaborador no mês) ---------- */
function colaborador(tasks, o){
  const [s,e,lbl] = monthRange(o.day); const ref = Math.min(e, Math.floor(Date.now()/864e5));
  const mine = tasks.filter(t => o.bucketOk(t) && t.people.includes(o.person));
  const inM = mine.filter(t => overlaps(t,s,e) || (t.doneOn!=null && t.doneOn>=s && t.doneOn<=e) || (!isDone(t) && t.due!=null && t.due<s));
  const doneM = inM.filter(t => t.doneOn!=null && t.doneOn>=s && t.doneOn<=e);
  const dueM = doneM.filter(t => t.due!=null); const onT = dueM.filter(t => t.doneOn<=t.due).length;
  const open = inM.filter(t => !isDone(t)); const late = open.filter(t => t.due!=null && t.due<ref);
  const shared = doneM.filter(t => t.people.length>1).length;
  const byP = new Map(); inM.forEach(t => { const k = proj(t); const v = byP.get(k)||{n:0,d:0}; v.n++; if(doneM.includes(t)) v.d++; byP.set(k,v); });
  return `<div class="rel"><div class="pg">
  ${hdrMini(o, "Relatório Individual", o.name(o.person), "COLABORADOR", `${lbl[0].toUpperCase()+lbl.slice(1)} · ${fmt(s)} a ${fmt(e)}`)}
  ${kpis([[inM.length,"Tarefas no mês"],[doneM.length,"Concluídas","#0B4A7A"],[dueM.length?pctN(onT,dueM.length)+"%":"—","No prazo"],[open.length,"Em aberto"],[late.length,"Vencidas","#A35400"],[dTxt(delayStats(doneM).mean),"Atraso médio","#45606F"]])}
  ${weekBars(doneM, s, e, "Concluídas por semana")}
  <h2>1. Projetos atendidos</h2><table><thead><tr><th>Projeto</th><th class="c" style="width:14%">Tarefas</th><th class="c" style="width:14%">Concluídas</th><th style="width:30%">% concluído</th></tr></thead><tbody>
  ${[...byP].sort((a,b)=>b[1].n-a[1].n).map(([p,v]) => `<tr><td class="lb">${esc(p)}</td><td class="c">${v.n}</td><td class="c">${v.d}</td><td>${pctN(v.d,v.n)}%<div class="meter"><i style="width:${pctN(v.d,v.n)}%"></i></div></td></tr>`).join("")}</tbody></table>
  <h2>2. Entregas concluídas no mês</h2><table><thead><tr><th style="width:9%">Data</th><th>Projeto · entrega</th><th style="width:24%">Responsáveis</th><th style="width:11%">Prazo</th></tr></thead>
  <tbody>${doneM.sort((a,b)=>a.doneOn-b.doneOn).map(t=>doneRow(t,o)).join("") || `<tr><td colspan="4" class="muted">Nenhuma.</td></tr>`}</tbody></table>
  <h2>3. Pendências</h2><table><thead><tr><th style="width:7%">Pri.</th><th>Projeto · entrega</th><th style="width:24%">Responsáveis</th><th style="width:11%">Prazo</th></tr></thead>
  <tbody>${open.sort((a,b)=>(a.due??1e9)-(b.due??1e9)).map(t=>openRow(t,o,ref)).join("") || `<tr><td colspan="4" class="muted">Sem pendências.</td></tr>`}</tbody></table>
  <h2>4. Comentários da coordenação</h2><table><tr><td class="box">${nl(o.texts.coment)}</td></tr></table>
  <div class="sig"><div>${esc(o.coord||"Coordenação SIC")}<br>Coordenador SIC</div><div>${esc(o.name(o.person))}<br>Colaborador</div></div>
  ${footer(o, "Coordenação SIC · Relatório individual")}
  </div></div>`;
}

/* ---------- blocos de indicadores ---------- */
const EXTERNAL = t => /protocolos e viabilidade/i.test(t.bucket||"") || (t.labels||[]).includes("VIABILIDADE");
function agingBlock(openTasks, ref){
  const bands = [[0,7,"até 7 dias"],[8,30,"8 a 30 dias"],[31,90,"31 a 90 dias"],[91,1e9,"mais de 90 dias"]];
  const age = t => ref - (t.start ?? t.created ?? ref);
  const grp = (list) => bands.map(([a,b]) => list.filter(t => age(t) >= a && age(t) <= b).length);
  const team = openTasks.filter(t => !EXTERNAL(t)), ext = openTasks.filter(EXTERNAL);
  const A = grp(team), B = grp(ext), mx = Math.max(1, ...A, ...B);
  const cell = (n,col) => `<td><div style="display:flex;align-items:center;gap:6px"><i style="display:block;height:10px;width:${Math.max(n?6:0, n/mx*100)}%;background:${col};border-radius:2px"></i><b>${n}</b></div></td>`;
  const oldest = [...ext].sort((a,b)=>age(b)-age(a)).slice(0,4);
  return `<table><thead><tr><th style="width:26%">Tarefas em aberto há…</th>${bands.map(b=>`<th>${b[2]}</th>`).join("")}</tr></thead><tbody>
    <tr><td class="lb">Com a equipe <span class="muted" style="font-weight:400">(${team.length})</span></td>${A.map(n=>cell(n,"#025D8A")).join("")}</tr>
    <tr><td class="lb">Aguardando órgão externo <span class="muted" style="font-weight:400">(${ext.length})</span></td>${B.map(n=>cell(n,"#9DB3BF")).join("")}</tr></tbody></table>
    ${oldest.length?`<div class="muted" style="font-size:9px;margin-top:3px">Mais antigas em órgão externo: ${oldest.map(t=>`${esc(t.name)} (${age(t)} d)`).join("; ")}.</div>`:""}`;
}
function discRisk(tasks, o, s, e){
  const ts = tasks.filter(t => (t.doneOn ?? t.due ?? 0) >= s && (t.start ?? t.created ?? 0) <= e && !ROUTINE.test(t.bucket||""));
  const m = new Map();
  ts.forEach(t => { const d = findIn(t.name, DISC); if(!d) return; const v = m.get(d) || new Map(); t.people.forEach(p => v.set(p, (v.get(p)||0)+1)); m.set(d, v); });
  const ppl = [...new Set([...m.values()].flatMap(v => [...v.keys()]))].sort((a,b)=>o.name(a).localeCompare(o.name(b)));
  const rows = [...m].sort((a,b)=>[...b[1].values()].reduce((x,y)=>x+y,0)-[...a[1].values()].reduce((x,y)=>x+y,0)).map(([d,v]) => {
    const tot = [...v.values()].reduce((x,y)=>x+y,0), top = Math.max(...v.values()), who = [...v].find(x=>x[1]===top)[0];
    const active = [...v.keys()].filter(p => o.activeOn(p, e)).length;
    const risk = active <= 1 || top/tot >= .8;
    return `<tr><td class="lb">${esc(d)}</td>${ppl.map(p => { const n = v.get(p)||0; return `<td class="c" style="${n?`background:rgba(2,93,138,${(.12+.6*n/top).toFixed(2)});color:${n/top>.6?"#fff":"#10283A"};font-weight:600`:""}">${n||""}</td>`; }).join("")}
      <td>${risk?`<span class="late">Alto</span> · ${esc(o.name(who))} concentra ${Math.round(top/tot*100)}%`:`<span style="color:#0B4A7A;font-weight:600">Baixo</span> · ${active} pessoas`}</td></tr>`; }).join("");
  return `<table><thead><tr><th style="width:20%">Disciplina</th>${ppl.map(p=>`<th class="c">${esc(o.name(p).split(" ")[0])}</th>`).join("")}<th style="width:28%">Risco de dependência</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="muted" style="font-size:8.5px;margin-top:3px">Nº de tarefas por pessoa, identificadas pela sigla da disciplina no nome (HID, SAN, INC, LEV…). Risco alto: uma pessoa ativa ou ≥ 80% com a mesma pessoa.</div>`;
}
function leadBlock(tasks, s, e, keyFn, label){
  const ts = tasks.filter(t => t.doneOn != null && t.start != null && t.doneOn >= s && t.doneOn <= e && !ROUTINE.test(t.bucket||""));
  const m = new Map(); ts.forEach(t => { const k = keyFn(t); if(!k) return; m.set(k, [...(m.get(k)||[]), t]); });
  const med = a => { const v = a.slice().sort((x,y)=>x-y); return v.length ? v[Math.floor(v.length/2)] : 0; };
  const rows = [...m].filter(([,a])=>a.length>=2).map(([k,a]) => { const lead = a.map(t=>t.doneOn-t.start), dl = a.filter(t=>t.due!=null).map(t=>Math.max(0,t.doneOn-t.due));
      return [k, a.length, med(lead), Math.min(...lead), Math.max(...lead), dl.length ? dl.reduce((x,y)=>x+y,0)/dl.length : 0]; })
    .sort((a,b)=>b[1]-a[1]);
  const mx = Math.max(1, ...rows.map(r=>r[4]));
  return `<table><thead><tr><th style="width:24%">${esc(label)}</th><th class="c" style="width:9%">Tarefas</th><th>Duração (início → conclusão): mediana e faixa</th><th class="c" style="width:13%">Atraso médio</th></tr></thead><tbody>
  ${rows.map(([k,n,md,mn,mxx,dl]) => `<tr><td class="lb">${esc(k)}</td><td class="c">${n}</td><td><div style="position:relative;height:12px;background:#EEF4F6;border-radius:3px">
      <i style="position:absolute;left:${mn/mx*100}%;width:${Math.max(1,(mxx-mn)/mx*100)}%;top:4px;height:4px;background:#9DB3BF"></i>
      <i style="position:absolute;left:calc(${md/mx*100}% - 4px);top:1px;width:9px;height:9px;border-radius:50%;background:#025D8A"></i></div>
      <span style="font-size:9px"><b>${md} d</b> <span class="muted">(${mn} a ${mxx} d)</span></span></td><td class="c">${dl?`<span class="late">${dTxt(dl)}</span>`:"0 d"}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">Poucas tarefas concluídas com data de início no período.</td></tr>`}</tbody></table>`;
}
function workMix(allTasks, s, e){
  const ts = allTasks.filter(t => t.doneOn != null && t.doneOn >= s && t.doneOn <= e);
  const grp = t => /atividades di[áa]rias/i.test(t.bucket||"") ? ((t.labels||[]).includes("ADM") ? "Administrativo" : "Rotina diária") : /reuni/i.test(t.bucket||"") ? "Reuniões" : EXTERNAL(t) ? "Protocolos e viabilidade" : "Projetos";
  const cols = {"Projetos":"#025D8A","Protocolos e viabilidade":"#61B4C6","Rotina diária":"#9DB3BF","Administrativo":"#8F8F8F","Reuniões":"#C9D9DF"};
  const m = new Map(); ts.forEach(t => m.set(grp(t), (m.get(grp(t))||0)+1));
  const arr = Object.keys(cols).map(k => [k, m.get(k)||0]).filter(x=>x[1]);
  const tot = arr.reduce((a,b)=>a+b[1],0) || 1;
  return `<div data-chart="${esc(JSON.stringify({type:"stack", segs:arr.map(([k,n]) => [n, cols[k], k])}))}" style="display:flex;height:22px;gap:2px;border-radius:4px;overflow:hidden">${arr.map(([k,n]) => `<i style="flex:${n};background:${cols[k]}"></i>`).join("")}</div>
  <div style="display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:5px;font-size:9.5px">${arr.map(([k,n]) => `<span><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${cols[k]};margin-right:4px;vertical-align:-1px"></i>${esc(k)} <b>${Math.round(n/tot*100)}%</b> <span class="muted">(${n})</span></span>`).join("")}</div>
  <div class="muted" style="font-size:8.5px;margin-top:2px">Tarefas concluídas no mês, todos os buckets (independe da seleção do relatório).</div>`;
}

/* ---------- RELATÓRIO MENSAL DO SETOR ---------- */
function mensal(tasks, o){
  const [s,e,lbl] = monthRange(o.day); const [ps,pe,plbl] = monthRange(s-1);
  const scope = tasks.filter(t => o.bucketOk(t)); const ref = Math.min(e, Math.floor(Date.now()/864e5));
  const stat = (a,b) => { const inM = scope.filter(t => overlaps(t,a,b) || (t.doneOn!=null && t.doneOn>=a && t.doneOn<=b));
    const d = inM.filter(t => t.doneOn!=null && t.doneOn>=a && t.doneOn<=b); const dd = d.filter(t=>t.due!=null);
    return {inM, d, onT: dd.filter(t=>t.doneOn<=t.due).length, dd: dd.length, late: dd.filter(t=>t.doneOn>t.due)}; };
  const A = stat(s,e), B = stat(ps,pe);
  const delta = (x,y) => { const v = x-y; return `<div style="font-size:9px;font-weight:600;color:${v>=0?"#0B4A7A":"#A35400"}">${v>=0?"▲":"▼"} ${Math.abs(v)} vs ${plbl.split(" ")[0]}</div>`; };
  const openEnd = scope.filter(t => !isDone(t) && (t.start??t.due??0) <= e);
  const k = (n,l,x,c) => `<div><b${c?` style="color:${c}"`:""}>${n}</b><span>${l}</span>${x||""}</div>`;
  const byP = new Map(); A.inM.forEach(t => { const kk = proj(t); const v = byP.get(kk)||{n:0,d:0}; v.n++; if(A.d.includes(t)) v.d++; byP.set(kk,v); });
  const team = o.team.filter(m => o.activeOn(m.planner, s));
  const top = [...A.late].sort((a,b)=>(b.doneOn-b.due)-(a.doneOn-a.due)).slice(0,6);
  return `<div class="rel"><div class="pg">
  ${hdrMini(o, "Relatório Mensal do Setor", lbl.split(" ")[0].toUpperCase(), String(fromDn(s).y), `${fmt(s)} a ${fmt(e)} · Setor de Instalações Civis`)}
  <div class="kp" style="grid-template-columns:repeat(4,1fr)">
    ${k(A.d.length,"Entregas concluídas",delta(A.d.length,B.d.length),"#0B4A7A")}
    ${k(A.dd?pctN(A.onT,A.dd)+"%":"—","Entregues no prazo",A.dd&&B.dd?delta(pctN(A.onT,A.dd),pctN(B.onT,B.dd)).replace(/(\d+) vs/,"$1 p.p. vs"):"")}
    ${k(dTxt(delayStats(A.d).mean),"Atraso médio das atrasadas","","#45606F")}
    ${k(openEnd.length,"Em aberto no fim do mês","", "#45606F")}
  </div>
  ${weekBars(A.d, s, e, "Entregas concluídas por semana")}
  <h2>1. Por projeto</h2><table><thead><tr><th>Projeto</th><th class="c" style="width:13%">Tarefas</th><th class="c" style="width:13%">Concluídas</th><th style="width:30%">% concluído</th></tr></thead><tbody>
  ${[...byP].sort((a,b)=>b[1].d-a[1].d||b[1].n-a[1].n).map(([p,v]) => `<tr><td class="lb">${esc(p)}</td><td class="c">${v.n}</td><td class="c">${v.d}</td><td>${pctN(v.d,v.n)}%<div class="meter"><i style="width:${pctN(v.d,v.n)}%"></i></div></td></tr>`).join("")}</tbody></table>
  <h2>2. Por colaborador</h2><table><thead><tr><th>Colaborador</th><th class="c" style="width:13%">Tarefas</th><th class="c" style="width:13%">Concluídas</th><th class="c" style="width:13%">No prazo</th><th style="width:22%">% concluído</th></tr></thead><tbody>
  ${team.map(m => { const ts = A.inM.filter(t=>t.people.includes(m.planner)); if(!ts.length) return ""; const d = ts.filter(t=>A.d.includes(t)); const dd = d.filter(t=>t.due!=null);
    return `<tr><td class="lb">${esc(m.nome||m.planner)}${o.activeOn(m.planner,e)?"":` <span class="muted" style="font-weight:400">(até ${fmtS(o.exitOf(m.planner))})</span>`}</td><td class="c">${ts.length}</td><td class="c">${d.length}</td><td class="c">${dd.length?pctN(dd.filter(t=>t.doneOn<=t.due).length,dd.length)+"%":"—"}</td><td>${pctN(d.length,ts.length)}%<div class="meter"><i style="width:${pctN(d.length,ts.length)}%"></i></div></td></tr>`; }).join("")}</tbody></table>
  <div style="break-inside:avoid"><h2>3. Para onde foi o trabalho</h2>${workMix(o.allTasks||tasks, s, e)}</div>
  <div style="break-inside:avoid"><h2>4. Idade das pendências</h2>${agingBlock(tasks.filter(t => !isDone(t) && !ROUTINE.test(t.bucket||"") && (t.start??t.created??0) <= e), ref)}</div>
  <h2>5. Risco de dependência por disciplina <span style="font-weight:400;letter-spacing:.05em">(últimos 90 dias)</span></h2>${discRisk(o.allTasks||tasks, o, e-89, e)}
  <h2>6. Tempo de execução por disciplina <span style="font-weight:400;letter-spacing:.05em">(últimos 6 meses)</span></h2>${leadBlock(scope, e-182, e, t => findIn(t.name, DISC), "Disciplina")}
  <h2>7. Maiores atrasos de entrega</h2><table><thead><tr><th style="width:9%">Data</th><th>Projeto · entrega</th><th style="width:24%">Responsáveis</th><th style="width:11%">Atraso</th></tr></thead>
  <tbody>${top.map(t=>doneRow(t,o)).join("") || `<tr><td colspan="4" class="muted">Nenhuma entrega fora do prazo.</td></tr>`}</tbody></table>
  <h2>8. Destaques e próximos passos</h2><table><tr><td class="box">${nl(o.texts.destaques)}</td></tr></table>
  ${footer(o, "Coordenação SIC · Relatório mensal")}
  </div></div>`;
}

/* ---------- CHECAGEM DO PLANNER ---------- */
function saude(tasks, o){
  const ref = o.exported ?? Math.floor(Date.now()/864e5);
  const ts = tasks.filter(t => o.bucketOk(t) && !ROUTINE.test(t.bucket||""));
  const open = ts.filter(t => !isDone(t));
  const semCrit = open.filter(t => !(t.items||[]).length && !t.notes);
  const semResp = open.filter(t => !t.people.length);
  const semPrazo = open.filter(t => t.due == null);
  const naoIni = open.filter(t => st3(t)==="ns" && t.due != null && t.due < ref);
  const velha = open.filter(t => !EXTERNAL(t) && t.due != null && ref - t.due > 30);
  const doneNoCk = ts.filter(t => isDone(t) && t.ckTotal && t.ckDone < t.ckTotal);
  const lst = (arr, extra) => arr.length ? `<table><tbody>${arr.slice(0,10).map(t => `<tr><td style="width:62%"><b>${esc(proj(t))}</b> · ${esc(t.name)}</td><td>${esc(people(t,o))}</td><td class="c" style="width:16%">${extra(t)}</td></tr>`).join("")}${arr.length>10?`<tr><td colspan="3" class="muted">+ ${arr.length-10} tarefas</td></tr>`:""}</tbody></table>` : `<div class="muted" style="padding:4px 0">Nenhuma. ✓</div>`;
  const score = Math.max(0, 100 - Math.round((semCrit.length + semResp.length*2 + semPrazo.length*2 + naoIni.length*2 + velha.length) / Math.max(1, open.length) * 50));
  return `<div class="rel"><div class="pg">
  ${hdrMini(o, "Checagem do Planner", score + "%", "QUALIDADE", "Tarefas de projeto · referência " + fmt(ref))}
  ${kpis([[open.length,"Tarefas abertas"],[semCrit.length,"Sem critério","#45606F"],[semResp.length,"Sem responsável","#A35400"],[naoIni.length,"Vencidas sem iniciar","#A35400"],[velha.length,"Vencidas há +30 dias","#A35400"],[doneNoCk.length,"Concluídas c/ lista incompleta"]])}
  <div class="muted" style="font-size:9px;margin-top:5px">Os relatórios saem melhores quando cada tarefa tem responsável, prazo atualizado e lista de verificação (que vira o critério de aceite).</div>
  <h2>1. Vencidas e ainda "Não iniciada"</h2>${lst(naoIni, t => `<span class="late">${fmtS(t.due)}</span>`)}
  <h2>2. Vencidas há mais de 30 dias (sem contar órgão externo)</h2>${lst(velha, t => `<span class="late">${ref - t.due} d</span>`)}
  <h2>3. Abertas sem lista de verificação nem notas</h2>${lst(semCrit, t => fmtS(t.due))}
  <h2>4. Sem responsável ou sem prazo</h2>${lst([...semResp, ...semPrazo], t => t.people.length ? "sem prazo" : "sem resp.")}
  <h2>5. Concluídas com lista de verificação incompleta</h2>${lst(doneNoCk, t => `${t.ckDone}/${t.ckTotal}`)}
  ${footer(o, "Coordenação SIC · Checagem do Planner")}
  </div></div>`;
}

/* ---------- ATA DE REUNIÃO ---------- */
function ata(a, o){
  const d = a.data != null ? a.data : Math.floor(Date.now()/864e5);
  const parts = (a.participantes||[]);
  const acoes = (a.acoes||[]).filter(x => (x.oque||"").trim());
  const pauta = (a.pauta||[]).filter(x => (x||"").trim());
  const hdr = `<div class="hd"><img src="${o.logo||"logo.png"}" alt="Ribeiro Lopes">
    <div class="co">Ribeiro Lopes Consultoria e Serviços Ltda<b>Ata de Reunião</b>Setor de Instalações Civis · SIC</div>
    <div class="wk"><small>ATA Nº</small><strong style="font-size:30px">${esc(a.numero||"—")}</strong><small>${fmt(d)}</small></div></div>`;
  return `<div class="rel"><div class="pg">${hdr}
  <table style="margin-top:8px"><tbody>
    <tr><td class="lb" style="width:16%">Data</td><td style="width:34%">${fmt(d)} · ${["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"][fromDn(d).w]}</td><td class="lb" style="width:16%">Horário</td><td>${esc(a.inicio||"—")}${a.fim?` às ${esc(a.fim)}`:""}</td></tr>
    <tr><td class="lb">Projeto / cliente</td><td>${esc(a.projeto||"—")}</td><td class="lb">Local</td><td>${esc(a.local||"—")}</td></tr>
    <tr><td class="lb">Tipo</td><td>${esc(a.tipo||"—")}</td><td class="lb">Redigida por</td><td>${esc(a.redator||o.coord||"—")}</td></tr>
  </tbody></table>
  <h2>1. Participantes</h2>
  <table><thead><tr><th style="width:36%">Nome</th><th style="width:34%">Empresa / função</th><th>Assinatura</th></tr></thead>
  <tbody>${parts.map(p => `<tr><td>${esc(p.nome)}</td><td>${esc(p.funcao||"")}</td><td style="height:22px"></td></tr>`).join("") || `<tr><td colspan="3" class="muted">—</td></tr>`}</tbody></table>
  <h2>2. Pauta</h2>
  <table><tbody>${pauta.map((p,i) => `<tr><td class="lb c" style="width:7%">${i+1}</td><td>${nl(p)}</td></tr>`).join("") || `<tr><td class="muted">—</td></tr>`}</tbody></table>
  <h2>3. Assuntos discutidos e decisões</h2>
  <table><tr><td class="box" style="height:auto;min-height:70px">${nl(a.discussao)}</td></tr></table>
  <h2>4. Ações e encaminhamentos</h2>
  <table><thead><tr><th style="width:6%">#</th><th>O que fazer</th><th style="width:20%">Responsável</th><th style="width:12%">Prazo</th><th style="width:16%">Projeto</th></tr></thead>
  <tbody>${acoes.map((x,i) => `<tr><td class="c">${i+1}</td><td>${nl(x.oque)}</td><td>${esc(x.resp||"—")}</td><td class="c">${x.prazo!=null?fmtS(x.prazo):"—"}</td><td>${esc(x.projeto||a.projeto||"—")}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">Sem ações registradas.</td></tr>`}</tbody></table>
  ${a.croqui?`<h2>5. Croqui / anotações</h2><div style="border:1px solid #B9CCD5;padding:6px;text-align:center"><img src="${a.croqui}" alt="Croqui" data-w="${a.croquiW||800}" data-h="${a.croquiH||230}" style="max-width:100%;max-height:300px"></div>`:""}
  <table style="margin-top:8px"><tbody><tr><td class="lb" style="width:22%">Próxima reunião</td><td>${a.proxima!=null?fmt(a.proxima):"A definir"}${a.proximaObs?` · ${esc(a.proximaObs)}`:""}</td></tr></tbody></table>
  <div class="sig"><div>${esc(a.redator||o.coord||"Coordenação SIC")}<br>Redator</div><div>Aprovação dos participantes</div></div>
  <div class="ft"><span>Coordenação SIC · Ata de reunião ${esc(a.numero||"")}</span><span>Gerada em ${o.now.toLocaleDateString("pt-BR")} às ${o.now.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</span></div>
  </div></div>`;
}

window.SIC_RELATORIOS = { ata, css, planejamento, planData, autoObjetivo, fechamento, projeto, colaborador, mensal, saude, sicWeek, monthRange };
})();
