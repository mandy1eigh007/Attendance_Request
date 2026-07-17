import { onRequest as adminRequest } from './functions/api/admin.js';
import { onRequest as gradebookRequest } from './functions/api/gradebook.js';
import { onRequestPost as testsPost } from './functions/api/tests.js';
import { onRequestPost as verifyTestAccessPost } from './functions/api/verify-test-access.js';
import { onRequestGet as submitGet, onRequestPost as submitPost } from './functions/submit.js';
import { onRequestGet as respondGet } from './functions/respond.js';

function pageContext(request, env, executionCtx) {
  return {
    request,
    env,
    params: {},
    data: {},
    waitUntil: executionCtx.waitUntil.bind(executionCtx),
    passThroughOnException: executionCtx.passThroughOnException?.bind(executionCtx),
    next: () => env.ASSETS.fetch(request),
  };
}

function methodNotAllowed(allow) {
  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', Allow: allow },
  });
}

export default {
  async fetch(request, env, executionCtx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const context = pageContext(request, env, executionCtx);

    if (path === '/api/admin') return adminRequest(context);
    if (path === '/api/gradebook') return gradebookRequest(context);

    if (path === '/api/tests') {
      if (request.method === 'POST') return testsPost(context);
      return methodNotAllowed('POST');
    }

    if (path === '/api/verify-test-access') {
      if (request.method === 'POST') return verifyTestAccessPost(context);
      return methodNotAllowed('POST');
    }

    if (path === '/submit') {
      if (request.method === 'GET') return submitGet(context);
      if (request.method === 'POST') return submitPost(context);
      return methodNotAllowed('GET, POST');
    }

    if (path === '/respond') {
      if (request.method === 'GET') return respondGet(context);
      return methodNotAllowed('GET');
    }

    return env.ASSETS.fetch(request);
  },
};
