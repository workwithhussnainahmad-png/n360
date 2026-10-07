'use strict';
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { createHotLaneRequest, createNativeWarmRequest } = require('./hot-lane-request.cjs');
for (const url of ['/api/student/dashboard', '/api/staff/profile?campuses=1', '/api/student/profile?include=catalog', '/api/student/timetable?x=%20']) {
  for (const authorization of [undefined, 'Bearer fixture', 'Bearer ', 'Basic fixture']) {
    const req = { url, headers: { host:'localhost:3000', origin:'https://allowed.example.test', cookie:'access_token=fixture-cookie', 'x-user-session':'untrusted' } };
    if (authorization) req.headers.authorization = authorization;
    const normal = createHotLaneRequest(req, NextRequest, false);
    const native = createNativeWarmRequest(req);
    assert.equal(native.nextUrl.pathname,normal.nextUrl.pathname);
    assert.equal(native.nextUrl.searchParams.toString(),normal.nextUrl.searchParams.toString());
    for (const name of ['authorization','origin','cookie','missing']) assert.equal(native.headers.get(name),normal.headers.get(name));
    native.headers.delete('X-User-Session');
    assert.equal(native.headers.get('x-user-session'),null);
    assert.equal(req.headers['x-user-session'],'untrusted','Facade stripping must not mutate raw headers');
    const light = createHotLaneRequest(req, NextRequest, true);
    assert.equal(light.url, normal.url);
    assert.equal(light.method, normal.method);
    assert.deepEqual([...light.headers], [...normal.headers]);
    assert.equal(light.nextUrl.pathname, normal.nextUrl.pathname);
    assert.equal(light.nextUrl.searchParams.toString(), normal.nextUrl.searchParams.toString());
    light.headers.delete('x-user-session');
    assert.equal(light.headers.get('x-user-session'), null);
    assert.equal(light.cookies.get('access_token')?.value, normal.cookies.get('access_token')?.value);
    assert.equal(light.signal.aborted, normal.signal.aborted);
  }
}
assert.throws(() => createHotLaneRequest({url:'/api/student/dashboard',headers:{host:'[',authorization:'Bearer fixture'}},NextRequest,true));
assert.throws(() => createNativeWarmRequest({url:'/api/student/dashboard',headers:{host:'['}}));
console.log('Deferred request adaptation: bearer/cookie fallback, URL/query, headers, session stripping and Request fallback contracts passed.');
