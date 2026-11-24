import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseMarkdown,numeric,bounds,classify} from './model.mjs';
import {seal,unseal} from './crypto.mjs';
test('decimal values, thresholds and qualitative data stay distinct',()=>{
 assert.deepEqual(numeric('7,10 ⚠'),{value:7.1,operator:'='});
 assert.deepEqual(numeric('< 3,0'),{value:3,operator:'<'});
 assert.equal(numeric('10^6,8 — 68–91%'),null);
 assert.equal(numeric('не обнаружены'),null);
 assert.deepEqual(numeric('35,0 (иммунитет есть)'),{value:35,operator:'='});
});
test('reference bounds include strict inequalities and ambiguous ranges',()=>{
 assert.equal(classify('3,0','< 3,0'),'outside');
 assert.equal(classify('3,0','≤ 3,0'),'inside');
 assert.equal(classify('5','4,1–6'),'inside');
 assert.equal(classify('0,6','1–5'),'outside');
 assert.equal(classify('< 19,1','< 16'),'unknown');
 assert.equal(classify('< 3,0','< 5,6'),'inside');
 assert.equal(classify('отрицательно','отрицательно'),'inside');
 assert.equal(classify('в умеренном количестве','отсутствуют'),'outside');
 assert.equal(classify('не обнаружены','< 5'),'inside');
 assert.equal(bounds('Фолликул. фаза: 1–10 / Лютеиновая: 2–5'),null);
});
test('absolute and percentage results with identical names retain distinct laboratory norms',()=>{
 const md='## Общий анализ крови — лейкоциты\n\n|Показатель|Ед. изм.|Референсные значения|20.11.2026|\n|---|---|---|---|\n|Нейтрофилы (NEU)|10^9/л|1–6|7,10 ⚠|\n|Нейтрофилы (NEU)|%|40–70|69|\n\n## Примечания к результатам 20.11.2026\n\n|Раздел|Показатель|Пояснение|\n|---|---|---|\n|Общий анализ крови — лейкоциты|Нейтрофилы (NEU)|в бланке тыс/мкл; реф. 1,56–6,13|\n|Общий анализ крови — лейкоциты|Нейтрофилы (NEU)|реф. 48–78|';
 const m=parseMarkdown(md);
 assert.equal(m.metrics[0].observations[0].reference,'1,56–6,13');
 assert.equal(m.metrics[1].observations[0].reference,'48–78');
 assert.equal(m.metrics[0].observations[0].status,'outside');
 assert.equal(m.metrics[1].observations[0].status,'inside');
});
test('dates and fixed-date qualitative columns retain every nonempty result',()=>{
 const m=parseMarkdown('## Общий анализ крови — эритроциты\n\n|Показатель|Ед. изм.|Референсные значения|01.01.2024|20.11.2026|\n|---|---|---|---|---|\n|Гемоглобин (Hb)|г/л|120–150|125|126|\n\n## Инфекционная серология (04.06.2026)\n\n|Показатель|Ед. изм.|Референсные значения|Результат|20.11.2026|\n|---|---|---|---|---|\n|Тест||отрицательно|отрицательно|отрицательно|');
 assert.equal(m.metrics.length,2);
 assert.deepEqual(m.metrics[1].observations.map(x=>x.date),['04.06.2026','20.11.2026']);
 assert.equal(m.metrics[0].observations[1].reference,'120–150');
});
test('encryption rejects wrong passwords and modified data',async()=>{
 const payload={marker:'private sample',records:[1,2]};
 const vault=await seal(payload,'correct-test-password-123');
 assert.ok(!JSON.stringify(vault).includes(payload.marker));
 assert.deepEqual(await unseal(vault,'correct-test-password-123'),payload);
 await assert.rejects(unseal(vault,'wrong-password'));
 const bad={...vault,ciphertext:(vault.ciphertext[0]==='A'?'B':'A')+vault.ciphertext.slice(1)};
 await assert.rejects(unseal(bad,'correct-test-password-123'));
});
