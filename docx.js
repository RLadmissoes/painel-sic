/* Gera um arquivo Word (.docx) a partir do HTML de um relatório do Painel SIC.
   Sem bibliotecas: monta o XML do Word, desenha os gráficos em imagem e empacota em zip. */
(function(){
"use strict";

/* ---------- zip (sem compressão) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = c&1 ? 0xEDB88320^(c>>>1) : c>>>1; t[n]=c>>>0; } return t; })();
const crc32 = u8 => { let c = 0xFFFFFFFF; for(let i=0;i<u8.length;i++) c = CRC[(c^u8[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; };
function zip(files){ // [{name, data:Uint8Array}]
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for(const f of files){
    const name = enc.encode(f.name), d = f.data, crc = crc32(d);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0,0x04034b50,true); h.setUint16(4,20,true); h.setUint16(6,0x0800,true); h.setUint16(8,0,true);
    h.setUint16(10,0,true); h.setUint16(12,0x21,true); h.setUint32(14,crc,true); h.setUint32(18,d.length,true); h.setUint32(22,d.length,true);
    h.setUint16(26,name.length,true); h.setUint16(28,0,true);
    parts.push(new Uint8Array(h.buffer), name, d);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0,0x02014b50,true); c.setUint16(4,20,true); c.setUint16(6,20,true); c.setUint16(8,0x0800,true); c.setUint16(10,0,true);
    c.setUint16(12,0,true); c.setUint16(14,0x21,true); c.setUint32(16,crc,true); c.setUint32(20,d.length,true); c.setUint32(24,d.length,true);
    c.setUint16(28,name.length,true); c.setUint32(42,off,true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + d.length;
  }
  const csize = central.reduce((a,b)=>a+b.length,0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0,0x06054b50,true); e.setUint16(8,files.length,true); e.setUint16(10,files.length,true); e.setUint32(12,csize,true); e.setUint32(16,off,true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], {type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
}

/* ---------- XML do Word ---------- */
const X = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const NAVY = "025D8A", INK = "10283A", MUTED = "6F8794", RED = "A35400", LINE = "B9CCD5";
const PAGE_W = 10206; // largura útil em twips (A4 com margens de 1,5 cm)
function rPr(st){
  return `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${st.b?"<w:b/>":""}${st.i?"<w:i/>":""}${st.caps?"<w:caps/>":""}${st.color?`<w:color w:val="${st.color}"/>`:""}${st.spacing?`<w:spacing w:val="${st.spacing}"/>`:""}<w:sz w:val="${st.sz||18}"/><w:szCs w:val="${st.sz||18}"/></w:rPr>`;
}
const run = (text, st) => `<w:r>${rPr(st)}<w:t xml:space="preserve">${X(text)}</w:t></w:r>`;
const brk = () => `<w:r><w:br/></w:r>`;
function para(runs, o={}){
  return `<w:p><w:pPr>${o.style?`<w:pStyle w:val="${o.style}"/>`:""}${o.keep?"<w:keepNext/>":""}${o.border?`<w:pBdr><w:top w:val="single" w:sz="6" w:space="2" w:color="${INK}"/></w:pBdr>`:""}${o.bottom?`<w:pBdr><w:bottom w:val="single" w:sz="18" w:space="4" w:color="${NAVY}"/></w:pBdr>`:""}${o.fill?`<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>`:""}<w:spacing w:before="${o.before??0}" w:after="${o.after??40}" w:line="${o.line??252}" w:lineRule="auto"/>${o.ind?`<w:ind w:left="${o.ind}" w:hanging="160"/>`:""}${o.jc?`<w:jc w:val="${o.jc}"/>`:""}</w:pPr>${runs}</w:p>`;
}
const toHex = c => { if(!c) return null; c = c.trim();
  let m = /^#([0-9a-f]{6})$/i.exec(c); if(m) return m[1].toUpperCase();
  m = /^#([0-9a-f]{3})$/i.exec(c); if(m) return m[1].split("").map(x=>x+x).join("").toUpperCase();
  m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c);
  if(m){ const a = m[4]!=null ? +m[4] : 1; return [m[1],m[2],m[3]].map(v => Math.round(255 - (255 - +v) * a).toString(16).padStart(2,"0")).join("").toUpperCase(); }
  return null; };
const styleOf = (el, prop) => { const m = new RegExp("(?:^|;)\\s*" + prop + "\\s*:\\s*([^;]+)").exec(el.getAttribute && el.getAttribute("style") || ""); return m ? m[1].trim() : null; };

/* texto corrido → runs */
function inline(node, st){
  if(node.nodeType === 3){ const t = node.textContent.replace(/\s+/g," "); return t.trim() || t === " " ? run(t, st) : ""; }
  if(node.nodeType !== 1) return "";
  const tag = node.tagName.toLowerCase(), cls = node.classList;
  if(tag === "br") return brk();
  if(tag === "i" || tag === "img") return "";
  let s2 = {...st};
  if(tag === "b" || tag === "strong") s2.b = true;
  if(cls.contains("late")) { s2.color = RED; s2.b = true; }
  if(cls.contains("muted")) s2.color = MUTED;
  if(cls.contains("p1")) return run("! P1", {...st, b:true, color:RED});
  if(cls.contains("p2")) return run("P2", {...st, b:true, color:"025D8A"});
  if(cls.contains("p3")) return run("P3", {...st, b:true, color:NAVY});
  if(cls.contains("tag")) return run(`  [${node.textContent.trim()}]`, {...st, sz:14, color: cls.contains("done") ? "0B4A7A" : cls.contains("lt") ? RED : NAVY, b:true});
  const col = toHex(styleOf(node, "color")); if(col) s2.color = col;
  return [...node.childNodes].map(n => inline(n, s2)).join("");
}
const BLOCK = new Set(["div","ul","ol","table","h2","p"]);
/* conteúdo de um bloco (célula ou corpo) → parágrafos */
function blocks(node, st, ctx){
  let out = "", buf = "";
  const flush = () => { if(buf.replace(/<[^>]+>/g,"").trim() || /<w:br\/>/.test(buf)) out += para(buf, {after:20, jc:st.jc}); buf = ""; };
  for(const n of node.childNodes){
    if(n.nodeType === 1 && BLOCK.has(n.tagName.toLowerCase())){ flush(); out += block(n, st, ctx); }
    else buf += inline(n, st);
  }
  flush();
  return out;
}
function block(el, st, ctx){
  const tag = el.tagName.toLowerCase(), cls = el.classList;
  if(el.dataset && el.dataset.chart){ try { return ctx.chart(JSON.parse(el.dataset.chart)); } catch(e){ return ""; } }
  const im = el.querySelector && el.querySelector(":scope > img[src^='data:image/png']");
  if(im && ctx.image) return ctx.image(im.getAttribute("src"), +im.dataset.w || 800, +im.dataset.h || 300);
  if(cls.contains("meter")) return "";
  if(cls.contains("hd")) return header(el, ctx);
  if(cls.contains("kp")) return kpis(el);
  if(cls.contains("sig")) return sig(el);
  if(cls.contains("meta")) return para([...el.children].map(c => inline(c, {sz:15, color:"45606F"})).join(run("     ", {sz:15})), {after:60});
  if(cls.contains("ft")) return para([...el.children].map(c => inline(c, {sz:14, color:MUTED})).join(run("   ·   ", {sz:14, color:MUTED})), {before:160, border:false});
  if(tag === "h2") return para(run(el.textContent.trim().toUpperCase(), {b:true, color:"FFFFFF", sz:20, spacing:30}), {fill:NAVY, before:200, after:0, keep:true});
  if(tag === "ul" || tag === "ol") return [...el.children].map(li => para(run("• ", st) + inline(li, st), {after:10, ind:200, jc:st.jc})).join("");
  if(tag === "table") return table(el, st, ctx);
  if(cls.contains("muted")) return blocks(el, {...st, color:MUTED, sz: Math.min(st.sz||18, 16)}, ctx);
  return blocks(el, st, ctx);
}
function table(el, st, ctx){
  const rows = [...el.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tr")];
  if(!rows.length) return "";
  // grade de colunas a partir da linha com mais células
  const ncol = Math.max(...rows.map(r => [...r.children].reduce((a,c)=>a + (+c.getAttribute("colspan")||1), 0)));
  let widths = new Array(ncol).fill(null);
  const ref = rows.find(r => r.children.length === ncol) || rows[0];
  [...ref.children].forEach((c,i) => { const w = styleOf(c, "width"); if(w && /%$/.test(w) && i < ncol) widths[i] = parseFloat(w); });
  const used = widths.reduce((a,b)=>a+(b||0),0), free = widths.filter(w=>w==null).length;
  widths = widths.map(w => Math.round(PAGE_W * (w != null ? w : (100-used)/Math.max(1,free)) / 100));
  const borders = `<w:tblBorders>${["top","left","bottom","right","insideH","insideV"].map(b=>`<w:${b} w:val="single" w:sz="4" w:space="0" w:color="${LINE}"/>`).join("")}</w:tblBorders>`;
  let xml = `<w:tbl><w:tblPr><w:tblW w:w="${PAGE_W}" w:type="dxa"/>${borders}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(w=>`<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>`;
  for(const r of rows){
    const head = r.parentElement && r.parentElement.tagName.toLowerCase() === "thead";
    xml += `<w:tr><w:trPr><w:cantSplit/>${head?"<w:tblHeader/>":""}</w:trPr>`;
    let col = 0;
    for(const c of r.children){
      const span = +c.getAttribute("colspan") || 1, w = widths.slice(col, col+span).reduce((a,b)=>a+b,0); col += span;
      const th = c.tagName.toLowerCase() === "th", lb = c.classList.contains("lb"), box = c.classList.contains("box");
      const fill = th ? "DDEEF4" : lb ? "EEF4F6" : toHex(styleOf(c, "background"));
      const cst = th ? {b:true, color:NAVY, sz:14, caps:true} : lb ? {...st, b:true, color:INK} : {...st};
      const fg = toHex(styleOf(c, "color")); if(fg) cst.color = fg;
      if(c.classList.contains("c")) cst.jc = "center";
      let inner = blocks(c, cst, ctx);
      if(box) inner = (inner || "") + new Array(Math.max(1, 6 - (inner.match(/<w:p>/g)||[]).length)).fill(para("", {after:60})).join("");
      if(!inner) inner = para("");
      xml += `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span>1?`<w:gridSpan w:val="${span}"/>`:""}${fill?`<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`:""}</w:tcPr>${inner}</w:tc>`;
    }
    if(col < ncol) xml += `<w:tc><w:tcPr><w:tcW w:w="${widths.slice(col).reduce((a,b)=>a+b,0)}" w:type="dxa"/>${ncol-col>1?`<w:gridSpan w:val="${ncol-col}"/>`:""}</w:tcPr>${para("")}</w:tc>`;
    xml += `</w:tr>`;
  }
  return xml + `</w:tbl>` + para("", {after:0, line:120});
}
const noBorders = `<w:tblBorders>${["top","left","bottom","right","insideH","insideV"].map(b=>`<w:${b} w:val="nil"/>`).join("")}</w:tblBorders>`;
function header(el, ctx){
  const co = el.querySelector(".co"), wk = el.querySelector(".wk");
  const title = co.querySelector("b") ? co.querySelector("b").textContent.trim() : "";
  const coTxt = [...co.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).filter(Boolean);
  const smalls = wk ? [...wk.querySelectorAll("small")].map(x => x.textContent.trim()) : [];
  const big = wk && wk.querySelector("strong") ? wk.querySelector("strong").textContent.trim() : "";
  const w = [1900, 6106, 2200];
  const cell = (wd, inner) => `<w:tc><w:tcPr><w:tcW w:w="${wd}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${inner}</w:tc>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${PAGE_W}" w:type="dxa"/>${noBorders}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${w.map(x=>`<w:gridCol w:w="${x}"/>`).join("")}</w:tblGrid><w:tr>
    ${cell(w[0], ctx.logo ? para(ctx.logo, {after:0}) : para(""))}
    ${cell(w[1], para(run((coTxt[0]||"").toUpperCase(), {sz:15, color:"45606F", b:true, spacing:20}), {after:0}) + para(run(title.toUpperCase(), {sz:30, b:true, color:NAVY}), {after:0}) + para(run((coTxt[1]||"").toUpperCase(), {sz:15, color:"45606F", b:true, spacing:20}), {after:0}))}
    ${cell(w[2], (smalls[0]?para(run(smalls[0], {sz:13, color:MUTED, b:true, spacing:30}), {after:0, jc:"right"}):"") + para(run(big, {sz: big.length > 4 ? 30 : 52, b:true, color:NAVY}), {after:0, jc:"right"}) + (smalls[1]?para(run(smalls[1], {sz:13, color:MUTED, b:true}), {after:0, jc:"right"}):""))}
  </w:tr></w:tbl>` + para("", {after:40, bottom:true, line:60});
}
function kpis(el){
  const items = [...el.children]; const w = Math.floor(PAGE_W / items.length);
  const b = `<w:tblBorders>${["top","left","bottom","right","insideV"].map(x=>`<w:${x} w:val="single" w:sz="4" w:space="0" w:color="${LINE}"/>`).join("")}</w:tblBorders>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${PAGE_W}" w:type="dxa"/>${b}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${items.map(()=>`<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid><w:tr>${items.map(it => {
    const n = it.querySelector("b"), lbl = it.querySelector("span"), extra = it.querySelector("div");
    const col = n ? (toHex(styleOf(n, "color")) || NAVY) : NAVY;
    return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${para(run(n ? n.textContent.trim() : "", {sz:36, b:true, color:col}), {after:0})}${para(run(lbl ? lbl.textContent.trim().toUpperCase() : "", {sz:13, b:true, color:"45606F"}), {after:extra?0:40})}${extra?para(run(extra.textContent.trim(), {sz:13, b:true, color: toHex(styleOf(extra,"color")) || "0B4A7A"}), {after:40}):""}</w:tc>`; }).join("")}</w:tr></w:tbl>` + para("", {after:0, line:120});
}
function sig(el){
  const items = [...el.children]; const w = Math.floor(PAGE_W / items.length);
  return para("", {before:500}) + `<w:tbl><w:tblPr><w:tblW w:w="${PAGE_W}" w:type="dxa"/>${noBorders}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${items.map(()=>`<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid><w:tr>${items.map(it => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:tcMar><w:left w:w="300" w:type="dxa"/><w:right w:w="300" w:type="dxa"/></w:tcMar></w:tcPr>${para(inline(it, {sz:16, color:"45606F"}), {jc:"center", border:true})}</w:tc>`).join("")}</w:tr></w:tbl>`;
}

/* ---------- gráficos → imagem PNG ---------- */
function drawChart(spec){
  const W = 1600, cv = document.createElement("canvas"), g = cv.getContext("2d");
  if(spec.type === "bars"){
    const H = 420; cv.width = W; cv.height = H; g.fillStyle = "#fff"; g.fillRect(0,0,W,H);
    g.fillStyle = "#025D8A"; g.font = "bold 26px Arial"; g.fillText(spec.title.toUpperCase(), 20, 40);
    const n = spec.values.length, mx = Math.max(1, ...spec.values), step = (W-40)/n, top = 90, bot = 330;
    g.strokeStyle = "#B9CCD5"; g.lineWidth = 2; g.beginPath(); g.moveTo(20, bot+.5); g.lineTo(W-20, bot+.5); g.stroke();
    spec.values.forEach((v,i) => { const x = 20 + i*step + step*.18, w = step*.64, h = (bot-top) * v / mx;
      g.fillStyle = "#61B4C6"; g.fillRect(x, bot-h, w, h);
      g.fillStyle = "#10283A"; g.font = "bold 28px Arial"; g.textAlign = "center"; g.fillText(String(v), x+w/2, bot-h-12);
      g.fillStyle = "#45606F"; g.font = "24px Arial"; g.fillText(spec.labels[i], x+w/2, bot+34);
      g.fillStyle = "#6F8794"; g.font = "20px Arial"; g.fillText(spec.subs[i]||"", x+w/2, bot+62); g.textAlign = "left"; });
    return {cv, wcm:18, hcm:18*H/W};
  }
  if(spec.type === "gantt"){
    const rowH = 30, top = 50, H = top + spec.rows.length*rowH + 50, lab = 520, x0 = lab, x1 = W-20;
    cv.width = W; cv.height = H; g.fillStyle = "#fff"; g.fillRect(0,0,W,H);
    const X = v => x0 + (v - spec.s0) / Math.max(1, spec.e0 - spec.s0) * (x1 - x0);
    g.font = "20px Arial"; spec.months.forEach(m => { const x = Math.max(x0, X(m.x)); g.strokeStyle = "#D5E2E8"; g.setLineDash([4,4]); g.beginPath(); g.moveTo(x, top-10); g.lineTo(x, H-40); g.stroke(); g.setLineDash([]); g.fillStyle = "#6F8794"; g.fillText(m.l, x+4, top-18); });
    spec.rows.forEach((r,i) => { const y = top + i*rowH;
      g.fillStyle = "#10283A"; g.font = "20px Arial"; let n = r.n; while(g.measureText(n).width > lab-20 && n.length > 4) n = n.slice(0,-2); if(n !== r.n) n += "…"; g.fillText(n, 10, y+20);
      g.fillStyle = r.c; g.globalAlpha = .85; g.fillRect(X(r.a), y+7, Math.max(5, X(r.b+1)-X(r.a)), 16); g.globalAlpha = 1;
      if(r.d != null){ g.fillStyle = "#10283A"; g.fillRect(X(r.d)-2, y+3, 4, 24); }
      g.strokeStyle = "#EEF4F6"; g.beginPath(); g.moveTo(0, y+rowH-.5); g.lineTo(W, y+rowH-.5); g.stroke(); });
    g.fillStyle = "#6F8794"; g.font = "18px Arial"; g.fillText("Barra: início → prazo no Planner · traço escuro: conclusão · azul-escuro concluída, azul-claro em aberto, laranja vencida", 10, H-14);
    return {cv, wcm:18, hcm:18*H/W};
  }
  if(spec.type === "stack"){
    const H = 70; cv.width = W; cv.height = H; g.fillStyle = "#fff"; g.fillRect(0,0,W,H);
    const tot = spec.segs.reduce((a,x)=>a+x[0],0) || 1; let x = 0;
    spec.segs.forEach(([n,c,l]) => { const w = (W - 4*(spec.segs.length-1)) * n / tot; g.fillStyle = c; g.fillRect(x, 8, w, 54);
      g.fillStyle = c === "#0B4A7A" ? "#fff" : "#10283A"; g.font = "bold 24px Arial"; const t = `${n} ${l}`; if(g.measureText(t).width < w - 12) g.fillText(t, x + 10, 44); x += w + 4; });
    return {cv, wcm:18, hcm:18*H/W};
  }
  return null;
}
const b64ToU8 = b => { const s = atob(b); const u = new Uint8Array(s.length); for(let i=0;i<s.length;i++) u[i] = s.charCodeAt(i); return u; };
function drawing(rid, id, wcm, hcm, name){
  const cx = Math.round(wcm * 360000), cy = Math.round(hcm * 360000);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${name}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

/* ---------- montagem ---------- */
async function build(html, opts={}){
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const media = []; let nid = 1;
  const addImg = (u8, wcm, hcm, name) => { const rid = "rImg" + (media.length+1); media.push({rid, name:`media/img${media.length+1}.png`, data:u8}); return drawing(rid, nid++, wcm, hcm, name); };
  let logo = "";
  if(opts.logo){ try { const r = await fetch(opts.logo); if(r.ok){ const u8 = new Uint8Array(await r.arrayBuffer()); logo = addImg(u8, 3.0, 3.0*323/512, "Logo"); } } catch(e){} }
  const ctx = { logo, image: (src, w, h) => { const u8 = b64ToU8(src.split(",")[1]); const wcm = 18, hcm = Math.min(12, 18 * h / w); return para(addImg(u8, hcm < 18*h/w ? hcm * w / h : wcm, hcm, "Croqui"), {before:60, after:60, jc:"center"}); }, chart: spec => { const c = drawChart(spec); if(!c) return ""; const u8 = b64ToU8(c.cv.toDataURL("image/png").split(",")[1]); return para(addImg(u8, c.wcm, c.hcm, "Gráfico"), {before:80, after:80}); } };
  const pages = [...doc.querySelectorAll(".rel .pg")];
  const body = pages.map((pg, i) => (i ? `<w:p><w:r><w:br w:type="page"/></w:r></w:p>` : "") + blocks(pg, {sz:18, color:INK}, ctx)).join("");
  const enc = new TextEncoder();
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="425" w:footer="425" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="40" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${media.map(m=>`<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${m.name}"/>`).join("")}</Relationships>`;
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const root = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/,"Z");
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${X(opts.title||"Relatório SIC")}</dc:title><dc:creator>Painel SIC</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`;
  return zip([
    {name:"[Content_Types].xml", data:enc.encode(ct)},
    {name:"_rels/.rels", data:enc.encode(root)},
    {name:"docProps/core.xml", data:enc.encode(core)},
    {name:"word/document.xml", data:enc.encode(documentXml)},
    {name:"word/styles.xml", data:enc.encode(styles)},
    {name:"word/_rels/document.xml.rels", data:enc.encode(rels)},
    ...media.map(m => ({name:"word/"+m.name, data:m.data}))
  ]);
}
window.SIC_DOCX = { build };
})();
