import {unseal} from './crypto.mjs';
import {shortDate} from './model.mjs';

const $=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=s=>String(s).replaceAll('⚠','').trim();
const fmt=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n);
const color={line:'#6f63b7',red:'#ba3546',band:'#eaf2ee',border:'#91afa2'};
let data=null,selected=null,group='overview',view='cards',period='all',query='',status='all';
const core=['Ферритин','Гемоглобин (Hb)','Витамин D (25-OH)','ТТГ','Глюкоза','Сывороточное железо'];
const navNames={'Гормоны щитовидной железы':'Щитовидная железа','Гемостаз (коагулограмма)':'Коагулограмма','Гормональные исследования — прочие':'Другие гормоны','Фемофлор — биоценоз влагалища':'Фемофлор'};
const statusName=s=>s==='outside'?'Вне референса':s==='inside'?'В референсе':'См. референс';
const last=m=>m.observations.at(-1);
const filteredObs=m=>m.observations.filter(o=>period==='all'||o.iso.startsWith(period));
const filteredLast=m=>filteredObs(m).at(-1);
function referenceText(o){return o.reference||'В бланке не указан';}
function titleFor(m){return m.name.startsWith('Посев мочи на микрофлору и дрожжеподобные')?'Посев мочи на микрофлору':m.name;}

function chart(m,small=false) {
 const obs=filteredObs(m), points=obs.filter(o=>o.value!==null&&!o.caution);
 if(!points.length)return small?'<div class="qual-mini">История результатов</div>':'<div class="range-warning"><strong>Здесь важны сами результаты</strong><span>Качественные значения показаны в истории по датам. Числовой график для них не строится.</span></div>';
 const w=small?280:innerWidth<600?Math.max(280,innerWidth-66):Math.max(320,(innerWidth-(innerWidth>850?236:0)-130)*.62),h=small?44:innerWidth<600?225:270,pad=small?{l:4,r:4,t:5,b:4}:innerWidth<600?{l:43,r:16,t:26,b:35}:{l:49,r:27,t:26,b:43};
 const xs=points.map(o=>Date.parse(o.iso)), xlo=Math.min(...xs),xhi=Math.max(...xs);
 const limits=small?[]:points.flatMap(o=>o.bounds?[o.bounds.low,o.bounds.high].filter(n=>n!==null):[]);
 const values=points.map(o=>o.value),extent=[...values,...limits],min=Math.min(...extent),max=Math.max(...extent),margin=Math.max((max-min)*.12,Math.abs(max)*.04,.1);
 const ylo=min>=0?Math.max(0,min-margin):min-margin,yhi=max+margin;
 const X=date=>xlo===xhi?w/2:pad.l+(Date.parse(date)-xlo)/(xhi-xlo)*(w-pad.l-pad.r);
 const Y=n=>h-pad.b-(n-ylo)/(yhi-ylo)*(h-pad.t-pad.b);
 const chunks=[];let segment=[];
 for(const o of points){if(o.operator==='='){segment.push(o);}else if(segment.length){chunks.push(segment);segment=[];}}
 if(segment.length)chunks.push(segment);
 let content='';
 // Stepwise ranges keep each laboratory's boundaries visible without interpolation.
 for(let i=0;i<points.length;i++){
  const o=points[i],b=o.bounds;if(!b)continue;
  const x=X(o.iso),left=i===0?pad.l:(X(points[i-1].iso)+x)/2,right=i===points.length-1?w-pad.r:(X(points[i+1].iso)+x)/2;
  const low=b.low??ylo,high=b.high??yhi;
  const top=Math.max(pad.t,Y(high)),bottom=Math.min(h-pad.b,Y(low));
  if(bottom>=top)content+=`<rect x="${left}" y="${top}" width="${Math.max(0,right-left)}" height="${bottom-top}" fill="${color.band}"/>`;
  if(!small)for(const bound of [b.low,b.high])if(bound!==null)content+=`<line x1="${left}" y1="${Y(bound)}" x2="${right}" y2="${Y(bound)}" stroke="${color.border}" stroke-width="1" stroke-dasharray="4 4"/>`;
 }
 if(!small){
  for(let i=0;i<4;i++){const v=ylo+(yhi-ylo)*i/3,y=Y(v);content+=`<line class="chart-grid" x1="${pad.l}" y1="${y}" x2="${w-pad.r}" y2="${y}"/><text x="${pad.l-10}" y="${y+4}" text-anchor="end">${fmt(v)}</text>`;}
  const positions=points.length===1?[points[0]]:points.length<=4?points:[points[0],points[Math.floor((points.length-1)/2)],points.at(-1)];
  for(const o of positions)content+=`<text x="${X(o.iso)}" y="${h-13}" text-anchor="${points.length===1?'middle':o===points[0]?'start':o===points.at(-1)?'end':'middle'}">${shortDate(o.date)}</text>`;
 }
 for(const seg of chunks)if(seg.length>1)content+=`<path d="${seg.map((o,i)=>(i?'L':'M')+X(o.iso).toFixed(2)+' '+Y(o.value).toFixed(2)).join(' ')}" fill="none" stroke="${color.line}" stroke-width="${small?1.7:2.2}" stroke-linejoin="round"/>`;
 for(const o of points){const outside=o.status==='outside',index=m.observations.indexOf(o);content+=`<circle cx="${X(o.iso)}" cy="${Y(o.value)}" r="${small?2.7:4.2}" fill="${outside?color.red:'#fffcfc'}" stroke="${outside?color.red:color.line}" stroke-width="${small?1.5:2}" ${o.operator!=='='?'stroke-dasharray="2 2"':''} ${small?'':`class="chart-point ${outside?'outside':''} ${o.operator!=='='?'censored':''}" tabindex="0" role="img" data-point="${index}" aria-label="${escape(o.date+', '+clean(o.raw)+', '+statusName(o.status))}"`}><title>${escape(o.date+' · '+clean(o.raw)+' '+m.unit+' · Референс: '+referenceText(o))}</title></circle>`;}
 if(!small){const final=points.at(-1),b=final.bounds;if(b){const marker=b.high??b.low;content+=`<text class="reference-label" x="${w-pad.r}" y="${Math.max(13,Y(marker)-7)}" text-anchor="end">Референс: ${escape(referenceText(final))}</text>`;}}
 return `<svg class="${small?'sparkline':'chart'}" viewBox="0 0 ${w} ${h}" ${small?'aria-hidden="true"':`role="img" aria-label="${escape('Динамика: '+titleFor(m)+'. Зелёная полоса — референс, красные точки — выход за его границы.')}"`}>${content}</svg>`;
}
function badge(o){return `<span class="status-label ${o.status}"><span class="status-icon" aria-hidden="true">${o.status==='outside'?'!':o.status==='inside'?'·':'—'}</span>${statusName(o.status)}</span>`;}
function renderDetail(){
 const m=data.metrics.find(m=>m.id===selected);if(!m)return;
 const obs=filteredObs(m),latest=obs.at(-1);
 if(!latest){$('detail').innerHTML='<p class="no-points">Для этого показателя нет результатов за выбранный период.</p>';return;}
 const points=obs.filter(o=>o.value!==null&&!o.caution),fullNumeric=points.length>0;
 const timeline=obs.map(o=>`<div class="timeline-item"><span class="timeline-date">${shortDate(o.date)}</span><span class="timeline-value ${o.status==='outside'?'outside':''}">${o.context?`<span class="muted">${escape(o.context)}: </span>`:''}${escape(clean(o.raw))}</span></div>`).join('');
 const history=obs.slice(-7).reverse().map(o=>`<tr><td>${shortDate(o.date)}${o.pregnancy?'<small class="pregnancy-text">Беременность</small>':''}${o.context?`<small class="history-context">${escape(o.context)}</small>`:''}</td><td class="${o.status==='outside'?'outside':''}"><strong>${escape(clean(o.raw))}</strong>${o.caution?'<small>Сверить единицы</small>':''}</td></tr>`).join('');
 const refs=obs.map(o=>`<tr><td>${shortDate(o.date)}</td><td>${escape(referenceText(o))}<small class="reference-origin">${escape(o.referenceOrigin)}${o.pregnancyReference?' · I триместр':o.pregnancy?' · беременность':''}</small></td><td class="${o.status==='outside'?'outside':''}">${escape(statusName(o.status))}</td></tr>`).join('');
 $('detail').innerHTML=`<div class="detail-top"><div><h3 class="detail-title">${escape(titleFor(m))}<span class="detail-unit">${escape(m.unit)}</span></h3><p class="detail-section">${escape(m.section)}</p></div><div><div class="detail-value ${latest.status==='outside'?'outside':''}" ${fullNumeric?'':'style="font-size:17px;white-space:normal;max-width:230px;letter-spacing:0"'}>${escape(clean(latest.raw))}${latest.value!==null?`<small> ${escape(m.unit)}</small>`:''}</div>${badge(latest)}</div></div><div class="detail-context"><span>Референс этой записи: <strong>${escape(referenceText(latest))}</strong>${latest.pregnancyReference?' <small>· I триместр</small>':''}</span>${latest.pregnancy?'<span class="pregnancy-badge">Беременность</span>':''}</div><div class="detail-body"><div>${fullNumeric?chart(m):`<div class="qual-timeline">${timeline}</div>`}${fullNumeric?`<div class="chart-legend"><span><i class="legend-line"></i>Результат</span><span><i class="legend-band"></i>Референс бланка</span><span>Красный — вне референса</span></div><p class="chart-caption">${points.length===1?'Одно измерение — пока без линии динамики.':points.some(o=>o.operator!=='=')?'Пунктирная точка — предел измерения, а не точное значение.':'Точки расположены по реальным датам анализов.'}</p>`:''}</div><div class="history-panel"><p class="history-heading">ИСТОРИЯ ЗНАЧЕНИЙ</p><table class="history-table"><thead><tr><th>Дата</th><th>Результат${m.unit?' · '+escape(m.unit):''}</th></tr></thead><tbody>${history}</tbody></table><p class="all-history">${obs.length>7?'Последние 7 из '+obs.length+' записей. Полная история — в таблице ниже.':obs.length+' '+declension(obs.length,['запись','записи','записей'])+' в архиве.'}</p></div></div><details class="reference-details"><summary>Референсы и полная история</summary><p><strong>Нормы соответствуют записи.</strong> Для старых дат использован диапазон из исходного файла, для 20.11.2026 — из нового бланка${m.name==='ТТГ'?' с учётом указанного диапазона I триместра':''}. Новые диапазоны не заменяют старые. Пометка «Беременность» обозначает контекст анализа; специальный диапазон I триместра применён только там, где он прямо указан в источнике. Переход полосы между датами условный. В исходных бланках могут отличаться метод и единицы.</p>${m.notes?`<p>${escape(m.notes)}</p>`:''}${obs.filter(o=>o.caution).map(o=>`<p>${escape(o.date+': '+o.caution)}</p>`).join('')}<table class="reference-table"><thead><tr><th>Дата</th><th>Референс</th><th>Отметка</th></tr></thead><tbody>${refs}</tbody></table>${obs.length>7?`<table class="history-table"><thead><tr><th>Дата</th><th>Результат</th></tr></thead><tbody>${obs.slice().reverse().map(o=>`<tr><td>${escape(o.date)}</td><td class="${o.status==='outside'?'outside':''}">${escape(clean(o.raw))}</td></tr>`).join('')}</tbody></table>`:''}</details>`;
}
function declension(n,forms){const k=n%100;return k>=11&&k<=14?forms[2]:n%10===1?forms[0]:n%10>=2&&n%10<=4?forms[1]:forms[2];}
function metricsForView(){
 let metrics=data.metrics;
 if(group==='overview'&&!query)metrics=core.map(name=>data.metrics.find(m=>m.name===name&&(!['Глюкоза'].includes(name)||m.group==='Биохимия крови'))).filter(Boolean);
 else if(group!=='all'&&group!=='overview')metrics=metrics.filter(m=>m.group===group);
 return metrics.filter(m=>{
  const latest=filteredLast(m);return latest&&(!query||[m.name,m.group,m.unit].join(' ').toLowerCase().replaceAll('ё','е').includes(query.replaceAll('ё','е')))&&(status==='all'||latest.status===status);
 });
}
function renderCards(metrics){
 $('metric-grid').innerHTML=metrics.map(m=>{const latest=filteredLast(m),obs=filteredObs(m),pure=latest.value!==null;return `<button type="button" class="metric-card ${selected===m.id?'selected':''}" data-metric="${m.id}" aria-pressed="${selected===m.id}" aria-label="${escape(titleFor(m)+': '+clean(latest.raw)+'. '+statusName(latest.status))}"><span class="card-top"><span class="card-title">${escape(titleFor(m))}</span><span class="card-open" aria-hidden="true">+</span></span><span class="card-group">${escape(m.group)}</span><span class="card-reading ${pure?'':'qualitative'} ${latest.status==='outside'?'outside':''}">${escape(clean(latest.raw))}${pure&&m.unit?`<small>${escape(m.unit)}</small>`:''}</span>${m.kind==='numeric'?chart(m,true):'<span class="qual-mini">'+obs.length+' '+declension(obs.length,['запись','записи','записей'])+' по датам</span>'}<span class="card-bottom"><span>${escape(latest.date)}</span><span class="card-status">${latest.status==='outside'?'Вне референса':''}</span></span></button>`;}).join('');
 $('metric-table').innerHTML=`<table class="metric-list-table"><thead><tr><th>Показатель</th><th>Последнее значение</th><th>Дата</th><th>Референс</th></tr></thead><tbody>${metrics.map(m=>{const o=filteredLast(m);return `<tr tabindex="0" data-metric="${m.id}" aria-label="${escape(titleFor(m))}"><td>${escape(titleFor(m))}<small>${escape(m.group)}</small></td><td class="${o.status==='outside'?'outside':''}">${escape(clean(o.raw))}<small>${escape(m.unit)}</small></td><td>${escape(o.date)}</td><td>${escape(referenceText(o))}</td></tr>`;}).join('')}</tbody></table>`;
}
function renderNavigation(){
 const groups=[...new Set(data.metrics.map(m=>m.group))];
 $('navigation').innerHTML=`<p class="nav-section-label">МОИ ДАННЫЕ</p><button class="nav-button ${group==='overview'?'active':''}" data-group="overview"><span>Обзор</span><span class="nav-count">◫</span></button><button class="nav-button ${group==='all'?'active':''}" data-group="all"><span>Все показатели</span><span class="nav-count">${data.metrics.length}</span></button><p class="nav-section-label">ПО РАЗДЕЛАМ</p>${groups.map(g=>`<button class="nav-button ${group===g?'active':''}" data-group="${escape(g)}"><span>${escape(navNames[g]||g)}</span><span class="nav-count">${data.metrics.filter(m=>m.group===g).length}</span></button>`).join('')}`;
}
function render(){
 if(!data)return;
 const metrics=metricsForView();
 if(!metrics.some(m=>m.id===selected))selected=metrics.find(m=>m.name==='Ферритин')?.id||metrics[0]?.id||selected;
 const all=group==='all',overview=group==='overview';
 $('breadcrumb-current').textContent=overview?'Обзор':all?'Все показатели':navNames[group]||group;
 $('page-title').innerHTML=overview?'Мои анализы <em>в динамике.</em>':all?'Вся история <em>анализов.</em>':escape(navNames[group]||group);
 $('page-eyebrow').textContent=overview?'ЛИЧНАЯ ИСТОРИЯ ЗДОРОВЬЯ':'ЛИЧНЫЙ АРХИВ / ПОКАЗАТЕЛИ';
 $('intro-copy').textContent=overview?'Отдельные цифры складываются в историю.':'Значения по датам. Референсы — рядом с историей.';
 $('grid-heading').textContent=overview&&!query?'Ключевые показатели':query?'Результаты поиска':'Все показатели раздела';
 $('visible-count').textContent=metrics.length;
 const scope=all||overview?data.metrics:data.metrics.filter(m=>m.group===group);
 const visible=scope.filter(m=>filteredObs(m).length),obs=visible.flatMap(m=>filteredObs(m)),dates=new Set(obs.map(o=>o.date));
 const outside=visible.filter(m=>filteredLast(m)?.status==='outside').length;
 $('summary').innerHTML=[['Показателей',visible.length,'в архиве'],['Результатов',obs.length,'записей'],['Дат анализов',dates.size,'сдач'],['Вне референса',outside,'последних значений']].map(([label,value,hint])=>`<div class="summary-cell"><span class="summary-label">${label}</span><span class="summary-value">${value}<small>${hint}</small></span></div>`).join('');
 renderNavigation();renderCards(metrics);
 $('detail').hidden=!metrics.length;$('empty-state').hidden=!!metrics.length;
 $('metric-grid').hidden=view!=='cards'||!metrics.length;$('metric-table').hidden=view!=='table'||!metrics.length;
 $('cards-view').classList.toggle('active',view==='cards');$('cards-view').setAttribute('aria-pressed',view==='cards');
 $('table-view').classList.toggle('active',view==='table');$('table-view').setAttribute('aria-pressed',view==='table');
 $('all-metrics').hidden=!overview||!!query;
 renderDetail();
}
function openGroup(g){group=g;query='';$('search').value='';$('sidebar').classList.remove('open');$('menu-button').setAttribute('aria-expanded','false');render();}
function downloadSource(){const url=URL.createObjectURL(new Blob([data.markdown],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='Анализы.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

$('unlock-form').addEventListener('submit',async event=>{
 event.preventDefault();const password=$('password').value;if(!password)return;
 $('unlock-button').disabled=true;$('unlock-button').textContent='Открываем…';$('login-error').textContent='';
 let vault;
 try{const response=await fetch('./vault.json',{cache:'no-store'});if(!response.ok)throw new Error('load');vault=await response.json();}catch{$('login-error').textContent='Не удалось загрузить архив. Проверьте соединение и попробуйте ещё раз.';}
 if(vault)try{
  data=await unseal(vault,password);
  $('password').value='';$('password').type='password';$('show-password').textContent='Показать';
  $('archive-years').textContent=data.dates[0].slice(-4)+' — '+data.dates.at(-1).slice(-4);
  $('last-date').textContent=data.dates.at(-1);
  $('lock-screen').hidden=true;$('workspace').hidden=false;render();$('main').focus();
 }catch{$('login-error').textContent='Пароль не подошёл или архив повреждён. Проверьте раскладку и попробуйте ещё раз.';}
 $('unlock-button').disabled=false;$('unlock-button').textContent='Открыть архив';
});
$('show-password').addEventListener('click',()=>{const show=$('password').type==='password';$('password').type=show?'text':'password';$('show-password').textContent=show?'Скрыть':'Показать';$('show-password').setAttribute('aria-label',show?'Скрыть пароль':'Показать пароль');});
$('logout-button').addEventListener('click',()=>{data=null;selected=null;group='overview';query='';period='all';status='all';$('workspace').hidden=true;$('lock-screen').hidden=false;$('detail').replaceChildren();$('metric-grid').replaceChildren();$('metric-table').replaceChildren();$('navigation').replaceChildren();$('summary').replaceChildren();$('search').value='';$('period').value='all';$('status-filter').value='all';tooltip.remove();$('password').focus();});
$('navigation').addEventListener('click',e=>{const button=e.target.closest('[data-group]');if(button)openGroup(button.dataset.group);});
$('home-link').addEventListener('click',e=>{e.preventDefault();openGroup('overview');});
$('all-metrics').addEventListener('click',()=>openGroup('all'));
$('source-button').addEventListener('click',downloadSource);
$('search').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();render();});
$('period').addEventListener('change',e=>{period=e.target.value;render();});
$('status-filter').addEventListener('change',e=>{status=e.target.value;render();});
$('cards-view').addEventListener('click',()=>{view='cards';render();});
$('table-view').addEventListener('click',()=>{view='table';render();});
$('reset-filters').addEventListener('click',()=>{query='';status='all';period='all';$('search').value='';$('period').value='all';$('status-filter').value='all';render();});
$('menu-button').addEventListener('click',()=>{const open=$('sidebar').classList.toggle('open');$('menu-button').setAttribute('aria-expanded',open);});
document.addEventListener('click',e=>{const item=e.target.closest('[data-metric]');if(item){selected=item.dataset.metric;render();$('detail').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'start'});}if($('sidebar').classList.contains('open')&&!e.target.closest('#sidebar,#menu-button')){$('sidebar').classList.remove('open');$('menu-button').setAttribute('aria-expanded','false');}});
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&data){e.preventDefault();$('search').focus();}if(e.key==='Escape'){$('sidebar').classList.remove('open');$('menu-button').setAttribute('aria-expanded','false');tooltip.remove();}if((e.key==='Enter'||e.key===' ')&&e.target.matches('tr[data-metric]')){e.preventDefault();e.target.click();}});
const tooltip=document.createElement('div');tooltip.className='chart-tooltip';tooltip.setAttribute('role','tooltip');
function showTooltip(event){const target=event.target.closest?.('[data-point]');if(!target||!data)return;const m=data.metrics.find(m=>m.id===selected),o=m.observations[+target.dataset.point];tooltip.innerHTML=`<strong>${escape(clean(o.raw)+' '+m.unit)}</strong><small>${escape(o.date)}${o.pregnancy?' · беременность':''}</small><small>Референс: ${escape(referenceText(o))}</small>`;document.body.append(tooltip);const rect=target.getBoundingClientRect();tooltip.style.left=Math.max(8,Math.min(innerWidth-250,rect.x-80))+'px';tooltip.style.top=Math.max(8,rect.y-tooltip.offsetHeight-12)+'px';}
$('detail').addEventListener('pointerover',showTooltip);$('detail').addEventListener('focusin',showTooltip);
$('detail').addEventListener('pointerout',e=>{if(e.target.closest?.('[data-point]'))tooltip.remove();});$('detail').addEventListener('focusout',()=>tooltip.remove());
window.addEventListener('scroll',()=>tooltip.remove(),{passive:true});
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(data)render();},150);});
