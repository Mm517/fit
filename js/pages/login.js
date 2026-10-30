/** Login / sign-up (used in Supabase mode; in mock mode it just redirects home). */
import * as api from '../data/api.js';
import { logoMark } from '../ui/icons.js';
import { esc, $ } from '../utils.js';

export default async function login({ root, navigate }) {
  if (api.backend === 'mock') { navigate('#/'); return; }
  let signup = false;
  const draw = (err = '') => {
    root.innerHTML = `<div class="lg-wrap">${logoMark(88)}<h1 class="lg-title">FitCircle</h1><p class="muted">معاً نحو نسخة أفضل منك</p>
      <form class="card lg-form" id="lg" novalidate>
        ${signup ? '<div class="field"><label for="lg-n">الاسم</label><input id="lg-n" class="input" autocomplete="name" required></div>' : ''}
        <div class="field"><label for="lg-e">البريد الإلكتروني</label><input id="lg-e" class="input" type="email" autocomplete="email" dir="ltr" required></div>
        <div class="field"><label for="lg-p">كلمة المرور</label><input id="lg-p" class="input" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="6" dir="ltr" required></div>
        ${err ? `<p class="lg-err" role="alert">${esc(err)}</p>` : ''}
        <button class="btn btn-primary btn-block">${signup ? 'إنشاء حساب' : 'تسجيل الدخول'}</button>
        <button type="button" class="btn btn-ghost btn-block" id="lg-sw">${signup ? 'لدي حساب بالفعل' : 'ليس لدي حساب؟ سجّل الآن'}</button></form></div>`;
    $('#lg-sw', root).onclick = () => { signup = !signup; draw(); };
    $('#lg', root).onsubmit = async (e) => {
      e.preventDefault();
      const email = $('#lg-e', root).value.trim(), pw = $('#lg-p', root).value;
      if (!email || pw.length < 6) return draw('أدخل بريداً صحيحاً وكلمة مرور من 6 أحرف على الأقل');
      try { signup ? await api.userSignUp(email, pw, $('#lg-n', root).value.trim()) : await api.userLogin(email, pw); location.hash = '#/'; location.reload(); }
      catch (er) { draw(er.message); }
    };
  };
  draw();
}
