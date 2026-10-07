import fs from 'node:fs';
for (const scenario of ['load','spike','stress']) {
  const file = `k6/scripts/${scenario}.js`;
  let source = fs.readFileSync(file,'utf8');
  source = source.replace(/const dash = http.get\(([^\n]+), \{ headers \}\);/g,
    'const dash = http.get($1, { headers, tags: { endpoint: "dashboard", role } });');
  source = source.replace('headers: authHeaders(token),','headers: authHeaders(token), tags: { endpoint: "dashboard", role },');
  source = source.replace('dashTrend.add(dash.timings.duration);','dashTrend.add(dash.timings.duration, { role });');
  source = source.replace("portalPath(role, 'timetable')}`, { headers });", "portalPath(role, 'timetable')}`, { headers, tags: { endpoint: 'timetable', role } });");
  source = source.replace('timetableTrend.add(timetable.timings.duration);','timetableTrend.add(timetable.timings.duration, { role });');
  source = source.replace('portalPath(role, page)}`, { headers });', "portalPath(role, page)}`, { headers, tags: { endpoint: page, role } });");
  source = source.replace('secondaryTrend.add(profile.timings.duration);','secondaryTrend.add(profile.timings.duration, { role });');
  source = source.replace('thresholds: strictThresholds,', `thresholds: {
    ...strictThresholds,
    'dashboard_ms{role:STUDENT}': [], 'dashboard_ms{role:STAFF}': [],
    'http_req_duration{endpoint:dashboard}': [],
    ${scenario==='load' ? "'http_req_duration{endpoint:timetable}': [], 'http_req_duration{endpoint:profile}': []," : ''}
  },`);
  fs.writeFileSync(file,source);
}
