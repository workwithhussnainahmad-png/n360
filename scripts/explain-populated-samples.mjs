import fs from 'node:fs';
import {Client} from 'pg';
const capture=JSON.parse(fs.readFileSync('docs/performance-experiments/populated-queries-and-plans.json','utf8'));
const top=capture.plans.toSorted((a,b)=>b.plan[0]['Execution Time']-a.plan[0]['Execution Time']).slice(0,3);
const client=new Client({connectionString:process.env.DIRECT_URL,application_name:'performance_plan_capture',statement_timeout:5000});
await client.connect();
try {
  await client.query('SET default_transaction_read_only=on');
  const output=['Three slowest unique idle samples after populating the fixture. Not load-time ranking.'];
  for (const item of top) {
    const result=await client.query('EXPLAIN (ANALYZE, BUFFERS) '+item.sql,item.params);
    output.push(`\n${item.label}; initial execution ${item.plan[0]['Execution Time']} ms\nSQL: ${item.sql}\nParameters: ${JSON.stringify(item.params)}\n`+result.rows.map(r=>r['QUERY PLAN']).join('\n'));
  }
  fs.writeFileSync('docs/performance-experiments/three-populated-plans.txt',output.join('\n'));
  console.log('Saved complete three populated plans.');
}finally{await client.end();}
