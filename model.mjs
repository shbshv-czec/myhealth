export const datePattern = /\d{2}\.\d{2}\.\d{4}/;
export function isoDate(date) { const [d,m,y]=date.split('.'); return `${y}-${m}-${d}`; }
export function shortDate(date) { return date.slice(0,6)+date.slice(-2); }
export function numeric(raw) {
  const clean=raw.replace(/⚠/g,'').trim();
  const m=clean.match(/^([<>≤≥]?)\s*([-+]?\d+(?:[.,]\d+)?)(?:\s*\([^()]*\))?$/);
  return m ? { value:Number(m[2].replace(',','.')), operator:m[1]||'=' } : null;
}
export function bounds(ref) {
  if (!ref || /фаз|трим|утро|вечер|сомнител/i.test(ref)) return null;
  const text=ref.replaceAll(',','.').replaceAll('−','-');
  const range=text.match(/^\s*(-?\d+(?:\.\d+)?)\s*[–—-]\s*(-?\d+(?:\.\d+)?)/);
  if(range) return {low:+range[1],high:+range[2],lowOpen:false,highOpen:false};
  const cmp=text.match(/^\s*([<>≤≥])\s*(-?\d+(?:\.\d+)?)/);
  if(cmp) return /[<≤]/.test(cmp[1]) ? {low:null,high:+cmp[2],highOpen:cmp[1]==='<'} : {low:+cmp[2],high:null,lowOpen:cmp[1]==='>'};
  return null;
}
const isNegative=s=> /^(отриц|не (обн|выяв)|не обн|отсутств)/i.test(s.trim());
export function classify(raw, ref) {
  if(/^\s*—|не определяет|не определял|не исследовал|не выполнял/i.test(raw)) return 'unknown';
  const n=numeric(raw), b=bounds(ref);
  if(!n&&b&&isNegative(raw)&&(b.low===null||b.low<=0))return 'inside';
  if(n&&b) {
    if(n.operator==='=') return (b.low!=null&&(n.value<b.low||(b.lowOpen&&n.value===b.low))) || (b.high!=null&&(n.value>b.high||(b.highOpen&&n.value===b.high))) ? 'outside':'inside';
    if(/[<≤]/.test(n.operator)&&b.low==null&&b.high!=null&&n.value<=b.high) return 'inside';
    if(/[>≥]/.test(n.operator)&&b.high==null&&b.low!=null&&n.value>=b.low) return 'inside';
    return 'unknown';
  }
  if (/^отриц|^не обнаруж|^не выяв|^отсутств/i.test(ref||'')) return isNegative(raw)?'inside':'outside';
  if (/нормоценоз/i.test(ref||'')) return /дисбиоз/i.test(raw)?'outside':/нормоценоз/i.test(raw)?'inside':'unknown';
  return raw.includes('⚠')?'outside':'unknown';
}
function groupFor(section) {
  if(section.startsWith('Общий анализ крови')) return 'Общий анализ крови';
  if(/Бактериология|Посев мочи/.test(section)) return 'Посев мочи';
  if(section.startsWith('Микроскопия')) return 'Микроскопия мазка';
  if(section.startsWith('Цитология')) return 'Цитология';
  if(section.startsWith('ПЦР')) return 'ПЦР на ИППП';
  if(section.startsWith('Инфекционная')) return 'Инфекции';
  return section;
}
export function parseMarkdown(markdown) {
  const lines=markdown.replaceAll('\r','').split('\n'), tables=[];
  const confirmedPregnancy=markdown.match(/^_(\d{2}\.\d{2}\.\d{4})[^\n]*Беременность подтверждена:/m)?.[1];
  let section='', paragraph='';
  for(let i=0;i<lines.length;i++) {
    const line=lines[i];
    if(line.startsWith('## ')) {section=line.slice(3); paragraph=''; continue;}
    if(line.startsWith('|')&&lines[i+1]?.startsWith('|---')) {
      const rows=[];
      while(lines[i]?.startsWith('|')) rows.push(lines[i++].split('|').slice(1,-1).map(s=>s.trim()));
      i--;
      tables.push({section,context:paragraph,header:rows[0],rows:rows.slice(2)});
    } else if(line.trim()&&!line.startsWith('---')) paragraph=line;
  }
  const noteTable=tables.find(t=>t.section.startsWith('Примечания к результатам '));
  const newDate=noteTable?.section.match(datePattern)?.[0];
  const notes=new Map();
  for(const row of noteTable?.rows||[]){const key=row[0]+'|'+row[1];if(!notes.has(key))notes.set(key,[]);notes.get(key).push(row[2]);}
  const metrics=[];
  for(let ti=0;ti<tables.length;ti++) {
    const table=tables[ti];
    if(/Источники новых|Примечания к результатам/.test(table.section)) continue;
    const {header,section}=table;
    const dated=header.map((h,i)=>({i,date:h.match(datePattern)?.[0]})).filter(x=>x.date);
    const headingDate=section.match(datePattern)?.[0];
    const unitIndex=header.indexOf('Ед. изм.');
    const refIndex=header.findIndex(h=>/^Реф/.test(h));
    let starts=dated.length?Math.min(...dated.map(x=>x.i)):(refIndex>=0?refIndex+1:unitIndex>=0?unitIndex+1:1);
    for(let ri=0;ri<table.rows.length;ri++) {
      const row=table.rows[ri], name=row[0];
      if(section==='Посев мочи — новые результаты' && name!=='Посев мочи на микрофлору и дрожжеподобные грибы рода Candida, с определением чувствительности к основному спектру антимикробных препаратов') continue;
      const unit=unitIndex>=0?row[unitIndex]:(header[1]==='КОЕ/мл'?'КОЕ/мл':'');
      const ref=refIndex>=0?row[refIndex]:'';
      const metric={id:`m${ti}-${ri}`,name,unit,reference:ref,group:groupFor(section),section,observations:[],notes:notes.get(section+'|'+name)?.shift()||''};
      let columns=dated.map(x=>({...x,context:''}));
      if(headingDate&&header.includes('Результат')) columns.push({i:header.indexOf('Результат'),date:headingDate,context:''});
      if(!columns.length&&headingDate) columns=header.slice(starts).map((h,j)=>({i:j+starts,date:headingDate,context:['Результат','КОЕ/мл'].includes(h)?'':h}));
      // Fixed-date clinical tables can have metadata to the left of "Результат".
      for(const column of columns) {
        const raw=row[column.i];
        if(!raw||raw==='—')continue;
        let reference=ref;
        const note=column.date===newDate?metric.notes:'';
        const rn=note.match(/реф\.?\s*:?[ ]*(.*)/i);
        if(rn) reference=rn[1].split(';')[0];
        // Convert laboratory bounds only when the source explicitly uses g/dL.
        if(column.date===newDate&&unit==='г/л'&&note.includes('г/дл')) {
          const b=bounds(reference);
          if(b?.low!=null&&b?.high!=null) reference=`${b.low*10}–${b.high*10}`;
        }
        if(column.date===newDate&&name==='ТТГ') {
          const firstTrimester=note.match(/I триместр\s+([\d,]+[–-][\d,]+)/);
          if(firstTrimester)reference=firstTrimester[1];
        }
        if(column.date===newDate&&name==='МНО (междунар. нормализ. отношение)'&&note.includes('не указан'))reference='';
        if(column.date===newDate&&/Бактерии|Соли/.test(name)&&note.includes('отсутствуют'))reference='отсутствуют';
        if(column.date===newDate&&name==='Антитела к краснухе IgM (Rubella IgM)')reference='отрицательно';
        if(column.date===newDate&&name==='Антитела к краснухе IgG (Rubella IgG)')reference='≥ 10';
        if(name==='Прогестерон'&&markdown.includes('_'+column.date)&&markdown.includes('Беременность подтверждена:')) {
          const firstTrimester=ref.match(/Беременность I трим\.:\s*([\d,]+[–-][\d,]+)/);
          if(firstTrimester)reference=firstTrimester[1];
        }
        const value=numeric(raw);
        let caution='';
        if(name==='Средняя концентрация Hb в эритроците (MCHC)'&&unit==='г/л'&&value?.value<100) caution='Масштаб отличается от остальных записей. Уточните единицы в исходном бланке. Значение сохранено и исключено из линии графика.';
        const pregnancy=!!confirmedPregnancy&&isoDate(column.date)>=isoDate(confirmedPregnancy);
        const referenceOrigin=column.date===newDate?'Новый бланк':'Исходный файл';
        const pregnancyReference=pregnancy&&((name==='ТТГ'&&column.date===newDate)||name==='Прогестерон');
        metric.observations.push({date:column.date,iso:isoDate(column.date),raw,value:value?.value??null,operator:value?.operator??null,reference,bounds:bounds(reference),status:classify(raw,reference),context:column.context,caution,pregnancy,referenceOrigin,pregnancyReference});
      }
      // Original headers sometimes label the qualitative reference as column 1.
      if(metric.observations.length) {
        metric.observations.sort((a,b)=>a.iso.localeCompare(b.iso));
        metric.kind=metric.observations.some(o=>o.value!==null)?'numeric':'qualitative';
        metrics.push(metric);
      }
    }
  }
  const dates=[...new Set(metrics.flatMap(m=>m.observations.map(o=>o.date)))].sort((a,b)=>isoDate(a).localeCompare(isoDate(b)));
  return {version:1,markdown,metrics,dates,tables,created:'2026-11-24',pregnancyDataFrom:confirmedPregnancy||null,bloodGroup:markdown.match(/_Группа крови_ _([^_]+)_/)?.[1]||''};
}
