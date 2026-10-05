/* Book a demo popup (Oct 5, 2026): the cal.com-style booking card. Every mailto:demo@evvora.com
   control opens it; submitting composes the demo request email with the chosen slot. */
(function () {
  var MAIL = "demo@evvora.com";
  var TIMES = ["9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM", "3:00 PM", "3:30 PM", "4:00 PM"];
  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var ov, mOff = 0, selDate = null, selTime = null;

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function build() {
    ov = el("div", "bk-ov");
    ov.innerHTML =
      '<div class="bk-card" role="dialog" aria-label="Book a demo">' +
      '<button class="bk-x" aria-label="Close">&#10005;</button>' +
      '<div class="bk-brand"><span class="bk-logo">E</span><span>EVVora</span></div>' +
      '<h3>Intro with EVVora</h3>' +
      '<p class="bk-sub">A quick look at your agency and how EVVora can help.</p>' +
      '<div class="bk-meta">' +
      '<span><i>&#9719;</i>20m</span>' +
      '<span><i>&#127909;</i>Google Meet</span>' +
      '<span><i>&#127757;</i>America/Chicago</span>' +
      '</div>' +
      '<div class="bk-calhead"><b id="bk-mon"></b><span class="bk-nav"><button id="bk-prev" aria-label="Previous month">&#8249;</button><button id="bk-next" aria-label="Next month">&#8250;</button></span></div>' +
      '<div class="bk-dow"><span>SUN</span><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span></div>' +
      '<div class="bk-days" id="bk-days"></div>' +
      '<div class="bk-times" id="bk-times"></div>' +
      '<div class="bk-form" id="bk-form">' +
      '<label>Your name</label><input id="bk-name" type="text" autocomplete="name">' +
      '<label>Email address</label><input id="bk-email" type="email" autocomplete="email">' +
      '<a class="bk-go" id="bk-go">Request this time &rarr;</a>' +
      '<div class="bk-fine">We confirm by email, usually the same day.</div>' +
      '</div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector(".bk-x").onclick = close;
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    ov.querySelector("#bk-prev").onclick = function () { if (mOff > 0) { mOff--; paintCal(); } };
    ov.querySelector("#bk-next").onclick = function () { if (mOff < 2) { mOff++; paintCal(); } };
    ov.querySelector("#bk-go").onclick = submit;
    paintCal();
  }

  function paintCal() {
    var now = new Date(), base = new Date(now.getFullYear(), now.getMonth() + mOff, 1);
    ov.querySelector("#bk-mon").innerHTML = MONTHS[base.getMonth()] + " <span>" + base.getFullYear() + "</span>";
    var days = ov.querySelector("#bk-days"); days.innerHTML = "";
    for (var i = 0; i < base.getDay(); i++) days.appendChild(el("span", "bk-pad"));
    var last = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    for (var d = 1; d <= last; d++) {
      var dt = new Date(base.getFullYear(), base.getMonth(), d);
      var b = el("button", "bk-d", String(d));
      var past = dt <= now, wknd = dt.getDay() === 0 || dt.getDay() === 6;
      if (past || wknd) b.disabled = true;
      if (selDate && dt.toDateString() === selDate.toDateString()) b.classList.add("on");
      (function (dt) { b.onclick = function () { selDate = dt; selTime = null; paintCal(); paintTimes(); }; })(dt);
      days.appendChild(b);
    }
    paintTimes();
  }

  function paintTimes() {
    var t = ov.querySelector("#bk-times"); t.innerHTML = "";
    ov.querySelector("#bk-form").classList.toggle("show", !!(selDate && selTime));
    if (!selDate) return;
    TIMES.forEach(function (x) {
      var b = el("button", "bk-t" + (x === selTime ? " on" : ""), x);
      b.onclick = function () { selTime = x; paintTimes(); };
      t.appendChild(b);
    });
    ov.querySelector("#bk-form").classList.toggle("show", !!(selDate && selTime));
  }

  function submit() {
    var name = ov.querySelector("#bk-name").value.trim();
    var email = ov.querySelector("#bk-email").value.trim();
    if (!selDate || !selTime) return;
    var when = MONTHS[selDate.getMonth()] + " " + selDate.getDate() + ", " + selDate.getFullYear() + " at " + selTime + " Central";
    var body = "Requested demo time: " + when + "\n" +
      (name ? "Name: " + name + "\n" : "") + (email ? "Email: " + email + "\n" : "") +
      "\nBooked from evvora.com";
    location.href = "mailto:" + MAIL + "?subject=" + encodeURIComponent("EVVora demo · " + when) + "&body=" + encodeURIComponent(body);
  }

  function open() { if (!ov) build(); ov.classList.add("show"); document.documentElement.classList.add("bk-lock"); }
  function close() { if (ov) ov.classList.remove("show"); document.documentElement.classList.remove("bk-lock"); }

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href^="mailto:' + MAIL + '"]');
    if (!a) return;
    var subj = (a.getAttribute("href") || "").toLowerCase();
    if (subj.indexOf("demo") === -1) return; // plain contact links keep composing email
    e.preventDefault(); open();
  });
})();
