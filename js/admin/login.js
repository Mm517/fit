/** Admin login screen. Mock credentials are shown ONLY when the mock backend is active. */
import * as api from '../data/api.js';
import { CONFIG } from '../config.js';
import { logoMark, icon } from '../ui/icons.js';
import { $ } from '../utils.js';

export default async function login({ root, navigate }) {
  const mock = api.backend === 'mock';
  root.innerHTML = `<form class="adm-login card card--lime" id="lf" novalidate>
    <div class="adm-login-logo">${logoMark(72)}<h1>FitCircle</h1><p class="muted">لوحة الإدارة</p></div>
    <div class="field"><label for="le">البريد الإلكتروني</label><input id="le" class="input" type="email" autocomplete="username" required dir="ltr" ${mock ? `value=""` : ''}></div>
    <div class="field"><label for="lp">كلمة المرور</label><input id="lp" class="input" type="password" autocomplete="current-password" required dir="ltr"></div>
    <p class="adm-error" id="lerr" role="alert" hidden></p>
    <button class="btn btn-primary btn-block" id="lbtn">دخول</button>
    ${mock ? `<div class="adm-mock"><b>${icon('info', { size: 16 })} وضع تجريبي فقط (MOCK-ONLY)</b>
      <span>البريد: <code>${CONFIG.MOCK_ADMIN.email}</code></span><span>كلمة المرور: <code>${CONFIG.MOCK_ADMIN.password}</code></span>
      <button type="button" class="btn btn-ghost btn-sm" id="fill">تعبئة تلقائية</button></div>` : ''}
    <a class="muted small" href="#/" style="text-align:center">العودة للتطبيق</a></form>`;
  $('#fill', root)?.addEventListener('click', () => { $('#le', root).value = CONFIG.MOCK_ADMIN.email; $('#lp', root).value = CONFIG.MOCK_ADMIN.password; });
  $('#lf', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#lerr', root), btn = $('#lbtn', root); err.hidden = true; btn.disabled = true;
    try { await api.adminLogin($('#le', root).value.trim(), $('#lp', root).value); navigate('#/admin'); }
    catch (ex) { err.textContent = ex.message || 'تعذر تسجيل الدخول'; err.hidden = false; btn.disabled = false; }
  });
}
