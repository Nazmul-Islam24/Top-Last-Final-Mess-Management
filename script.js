// Google Sheets Webhook App URL
const GOOGLE_SHEET_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbzvy45mhfcw1qkBirPMAy4v2_MF8Py-iqaxa3JX5wsa8MHBsuraeSUNbsl2rlgyHe26RQ/exec";

// Admin Credentials Setup
const ADMIN_PIN = "1233447";
let isAdmin = false;

// ==========================================
// FIREBASE REALTIME DATABASE
// ==========================================

const firebaseDataRef = firebaseDB.ref("messData");

let firebaseReady = false;
let firebaseFirstLoad = true;


// Initial Default State
const defaultState = {
    selectedMonth: "January",
    members: [
        { id: 1, name: "Bachelor 1", deposit: 0 },
        { id: 2, name: "Bachelor 2", deposit: 0 },
        { id: 3, name: "Bachelor 3", deposit: 0 },
        { id: 4, name: "Bachelor 4", deposit: 0 },
    ],
    bazar: [
    ],
    extra: [
    ],
    dailyMeals: {}
};

let state = JSON.parse(JSON.stringify(defaultState));

// [UPDATE] Submit বাটনে চাপ দেওয়ার আগ পর্যন্ত অস্থায়ী ডাটা ধরে রাখার জন্য Variable
let tempDailyMeals = {};


// Initialize App
window.addEventListener('DOMContentLoaded', () => {

    setupMonthSelector();
    populateDailyDateSelector();
    updateAdminUI();

    // Start Firebase real-time synchronization
    initializeFirebaseSync();

});

function renderAll() {

    // Firebase থেকে আসা selected month
    // dropdown-এও দেখাবে
    const monthDropdown =
        document.getElementById('selected-month');

    if (monthDropdown && state.selectedMonth) {
        monthDropdown.value = state.selectedMonth;
    }

    renderDailyMealTab();
    renderMembers();
    renderBazar();
    renderExtra();
    renderSearchDropdown();
    calculateAll();
    renderSummary();
}

// AUTOMATIC MEMBER SEARCH DROPDOWN RENDER
function renderSearchDropdown() {
    const select = document.getElementById('global-member-search');
    const mobileSelect = document.getElementById('global-member-search-mobile');

    const optionsHtml = '<option value="" disabled selected>🔍 Select Member / Search Name...</option>' +
        state.members.map(m => `<option value="${m.id}" class="bg-slate-800 text-slate-100 font-medium py-1">👤 ${m.name}</option>`).join('');

    if (select) select.innerHTML = optionsHtml;
    if (mobileSelect) mobileSelect.innerHTML = optionsHtml;
}

function handleMemberSelect(memberId) {
    if (memberId) {
        openMemberModal(Number(memberId));
        setTimeout(() => {
            const select = document.getElementById('global-member-search');
            const mobileSelect = document.getElementById('global-member-search-mobile');

            if (select) select.value = "";
            if (mobileSelect) mobileSelect.value = "";
        }, 500);
    }
}

// Month Selector Handler
function setupMonthSelector() {
    const monthDropdown = document.getElementById('selected-month');

    if (monthDropdown) {
        if (state.selectedMonth) {
            monthDropdown.value = state.selectedMonth;
        }

        monthDropdown.addEventListener('change', (e) => {
            state.selectedMonth = e.target.value;
            saveData(false);
            renderAll();
        });
    }
}

// Populate 1 to 31 Days in Daily Sheet (UPDATED)
function populateDailyDateSelector() {
    const select = document.getElementById('daily-date-select');
    if (!select) return;

    // 🟢 [FIX] শুরুতে ফাঁকা ডিফল্ট অপশন যোগ করা হলো
    select.innerHTML = '<option value="" selected disabled>-- Select Day --</option>';

    for (let day = 1; day <= 31; day++) {
        const opt = document.createElement('option');
        opt.value = day;
        opt.innerText = `Day ${day}`;
        select.appendChild(opt);
    }

    // 🟢 [FIX] ডিফল্ট ভ্যালু খালি রাখা হলো যাতে অটো দিন সিলেক্ট না হয়ে যায়
    select.value = "";
}

// Admin Verification Functions
function openAdminModal() {
    if (isAdmin) {
        isAdmin = false;
        alert("আপনি এডমিন মোড থেকে লগআউট করেছেন।");
        updateAdminUI();
        renderAll();
    } else {
        document.getElementById('admin-modal').classList.remove('hidden');
    }
}

function closeAdminModal() {
    document.getElementById('admin-modal').classList.add('hidden');
    document.getElementById('admin-pin-input').value = '';
}

function verifyAdmin() {

    const inputPin = document
        .getElementById('admin-pin-input')
        .value
        .trim();

    if (inputPin === ADMIN_PIN) {

        isAdmin = true;

        alert("এডমিন হিসেবে লগইন সফল হয়েছে!");

        closeAdminModal();
        updateAdminUI();
        renderAll();

    } else {

        alert("ভুল পিন কোড! শুধুমাত্র এডমিন এডিট করতে পারবেন।");
    }
}

function updateAdminUI() {
    const btnText = document.getElementById('admin-btn-text');
    const adminControls = document.getElementById('admin-controls');
    const adminOnlyElems = document.querySelectorAll('.admin-only');

    // 🟢 [NEW] Month Selector Control - এডমিন না হলে ডিসেবল থাকবে
    const monthDropdown = document.getElementById('selected-month');
    if (monthDropdown) {
        monthDropdown.disabled = !isAdmin;
    }

    if (isAdmin) {
        if (btnText) btnText.innerText = "Logout Admin";
        if (adminControls) adminControls.classList.remove('hidden');
        adminOnlyElems.forEach(el => el.classList.remove('hidden'));
    } else {
        if (btnText) btnText.innerText = "Admin Login";
        if (adminControls) adminControls.classList.add('hidden');
        adminOnlyElems.forEach(el => el.classList.add('hidden'));
    }
}

// ১. পেজের নাম ও আইকন ম্যাপ (Members-এ showCount যোগ করা হয়েছে)
const pageDetails = {
    'dashboard': { name: 'Dashboard', icon: 'fa-chart-pie', color: 'text-indigo-400' },
    'daily-meal': { name: 'Daily Meal Sheet', icon: 'fa-calendar-check', color: 'text-amber-400' },
    'members': { name: 'Members', icon: 'fa-users', color: 'text-emerald-400', showCount: true },
    'bazar': { name: 'Bazar & Extra Expenses', icon: 'fa-cart-shopping', color: 'text-sky-400' },
    'summary': { name: 'Final Summary', icon: 'fa-file-invoice-dollar', color: 'text-cyan-400' }
};

// ২. কারেন্ট পেজের নাম ও মেম্বার সংখ্যা আপডেট করার হেল্পার ফাংশন
function updateMobilePageIndicator(tabName) {
    const indicator = document.getElementById('mobile-active-page-name');
    if (!indicator || !pageDetails[tabName]) return;

    const page = pageDetails[tabName];

    // মেম্বার সংখ্যা বের করার লজিক (state.members থেকে সংখ্যাটি নেবে)
    let countText = '';
    if (page.showCount && typeof state !== 'undefined' && state.members) {
        countText = ` (${state.members.length})`;
    }

    indicator.innerHTML = `<i class="fa-solid ${page.icon} ${page.color}"></i> ${page.name}${countText}`;
}

// মেম্বার সংখ্যা আপডেট হলে ছোট স্ক্রিনের কাউন্ট রিফ্রেশ করার ফাংশন
function refreshMobileIndicatorCount() {
    const activeTab = ['dashboard', 'daily-meal', 'members', 'bazar', 'summary'].find(t => {
        const sec = document.getElementById(`sec-${t}`);
        return sec && !sec.classList.contains('hidden');
    }) || 'dashboard';

    updateMobilePageIndicator(activeTab);
}



// Tab Switching System (আপডেট করা হয়েছে)
function switchTab(tabName) {
    ['dashboard', 'daily-meal', 'members', 'bazar', 'summary'].forEach(t => {
        const sec = document.getElementById(`sec-${t}`);
        const tab = document.getElementById(`tab-${t}`);
        if (sec) sec.classList.add('hidden');
        if (tab) {
            tab.classList.remove('border-indigo-500', 'text-indigo-400');
            tab.classList.add('border-transparent', 'text-slate-400');
        }
    });
    const activeSec = document.getElementById(`sec-${tabName}`);
    const activeTab = document.getElementById(`tab-${tabName}`);
    if (activeSec) activeSec.classList.remove('hidden');
    if (activeTab) {
        activeTab.classList.add('border-indigo-500', 'text-indigo-400');
        activeTab.classList.remove('border-transparent', 'text-slate-400');
    }

    // 🟢 মোবাইল ভিউতে পেজের নাম, আইকন ও মেম্বার সংখ্যা আপডেট করবে
    updateMobilePageIndicator(tabName);
}

// মোবাইল ড্রপডাউন থেকে ট্যাবে ক্লিক করলে সুইচ হয়ে মেনু বন্ধ হওয়া
function switchTabMobile(tabName) {
    if (typeof switchTab === 'function') {
        switchTab(tabName);
    }
    toggleMobileMenu();
}

// ==========================================
// 🟢 DAILY MEAL SHEET HANDLERS (UPDATED)
// ==========================================

function renderDailyMealTab() {
    // 🟢 [FIX 1] অটো "1" ধরা বন্ধ করে খালি (null) ভ্যালু নেওয়া হচ্ছে
    const daySelect = document.getElementById('daily-date-select');
    const day = daySelect ? daySelect.value : "";

    const lMenu = document.getElementById('daily-lunch-menu');
    const dMenu = document.getElementById('daily-dinner-menu');
    const tbody = document.getElementById('daily-meal-table-body');

    // 🟢 [UPDATE] Admin না হলে Lunch ও Dinner ড্রপডাউন disabled থাকবে
    if (lMenu) lMenu.disabled = !isAdmin;
    if (dMenu) dMenu.disabled = !isAdmin;

    // 🟢 [FIX 2] যদি কোনো দিন (Day) সিলেক্ট করা না থাকে, তবে মেনু "Null" ও টেবিল খালি থাকবে
    if (!day) {
        if (lMenu) lMenu.value = "Null";
        if (dMenu) dMenu.value = "Null";
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">Please select a day to view or edit meals.</td></tr>`;
        return;
    }

    // 🟢 [FIX 3] নতুন দিনের জন্য ডিফল্ট "Fixed" বাদ দিয়ে "Null" রাখা হচ্ছে
    if (!tempDailyMeals[day]) {
        if (state.dailyMeals[day]) {
            tempDailyMeals[day] = JSON.parse(JSON.stringify(state.dailyMeals[day]));
        } else {
            tempDailyMeals[day] = {
                lunchMenu: "Null",  // Fixed বাদ দিয়ে "Null" রাখা হলো
                dinnerMenu: "Null", // Fixed বাদ দিয়ে "Null" রাখা হলো
                meals: {}
            };
        }
    }

    const dayData = tempDailyMeals[day];
    if (lMenu) lMenu.value = dayData.lunchMenu || "Null";
    if (dMenu) dMenu.value = dayData.dinnerMenu || "Null";

    if (!tbody) return;
    tbody.innerHTML = '';

    const disabledAttr = isAdmin ? '' : 'disabled';
    let totalDayLunch = 0;
    let totalDayDinner = 0;
    let grandTotalDayMeals = 0;

    state.members.forEach(m => {
        if (!dayData.meals[m.id]) {
            dayData.meals[m.id] = { lunch: 0, dinner: 0 };
        }
        const mMeal = dayData.meals[m.id];
        const lunchVal = Number(mMeal.lunch) || 0;
        const dinnerVal = Number(mMeal.dinner) || 0;
        const totalDayMeal = lunchVal + dinnerVal;

        totalDayLunch += lunchVal;
        totalDayDinner += dinnerVal;
        grandTotalDayMeals += totalDayMeal;

        const lunchDisplay = (mMeal.lunch === 0 || mMeal.lunch === "0" || mMeal.lunch === "") ? "" : mMeal.lunch;
        const dinnerDisplay = (mMeal.dinner === 0 || mMeal.dinner === "0" || mMeal.dinner === "") ? "" : mMeal.dinner;

        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-700/50 hover:bg-slate-800/40 transition";

        tr.innerHTML = `
            <td class="p-1.5 sm:p-2.5 font-bold text-xs sm:text-sm text-slate-100 cursor-pointer hover:text-indigo-400 break-words" onclick="openMemberModal(${m.id})">
                <i class="fa-solid fa-user text-indigo-400 mr-1 text-[11px] sm:text-xs"></i> ${m.name}
            </td>
            <td class="p-1.5 sm:p-2.5 text-center">
                <input type="number" min="0" step="0.5" placeholder="0" value="${lunchDisplay}" ${disabledAttr}
                    oninput="updateTempDailyMealCount('${day}', ${m.id}, 'lunch', this.value)"
                    class="w-10 sm:w-14 bg-slate-900 border border-slate-700 rounded p-0.5 sm:p-1 text-center font-bold text-xs sm:text-sm text-amber-400 focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed">
            </td>
            <td class="p-1.5 sm:p-2.5 text-center">
                <input type="number" min="0" step="0.5" placeholder="0" value="${dinnerDisplay}" ${disabledAttr}
                    oninput="updateTempDailyMealCount('${day}', ${m.id}, 'dinner', this.value)"
                    class="w-10 sm:w-14 bg-slate-900 border border-slate-700 rounded p-0.5 sm:p-1 text-center font-bold text-xs sm:text-sm text-indigo-400 focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed">
            </td>
            <td class="p-1.5 sm:p-2.5 text-center font-extrabold text-emerald-400 text-xs sm:text-sm" id="row-total-${m.id}">
                ${totalDayMeal}
            </td>
            <td class="p-1.5 sm:p-2.5 text-right">
                <button onclick="openMemberModal(${m.id})" class="text-[11px] sm:text-xs text-indigo-400 hover:text-indigo-300">
                    <i class="fa-solid fa-eye mr-0.5"></i> <span class="hidden sm:inline">Details</span>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // টোটাল রো
    const totalTr = document.createElement('tr');
    totalTr.id = "daily-meal-total-row";
    totalTr.className = "bg-slate-900/90 font-bold border-t border-slate-700";
    totalTr.innerHTML = `
        <td class="p-1.5 sm:p-2.5 text-[10px] sm:text-xs uppercase text-slate-400 break-words">Total:</td>
        <td class="p-1.5 sm:p-2.5 text-center text-amber-400 font-extrabold text-xs sm:text-sm" id="sum-day-lunch">${totalDayLunch}</td>
        <td class="p-1.5 sm:p-2.5 text-center text-indigo-400 font-extrabold text-xs sm:text-sm" id="sum-day-dinner">${totalDayDinner}</td>
        <td class="p-1.5 sm:p-2.5 text-center text-emerald-400 font-extrabold text-xs sm:text-sm" id="sum-day-grand">${grandTotalDayMeals}</td>
        <td></td>
    `;
    tbody.appendChild(totalTr);
}


// 🟢 ইনপুটে টাইপ করলে এখন আর পুরো টেবিল রেন্ডার হবে না (ফলে কিবোর্ড ও ফোকাস ঠিক থাকবে)
function updateTempDailyMealCount(day, memberId, type, val) {
    if (!isAdmin) return; // Admin না হলে ডাটা পরিবর্তন হবে না

    if (!tempDailyMeals[day]) tempDailyMeals[day] = { lunchMenu: "Null", dinnerMenu: "Null", meals: {} };
    if (!tempDailyMeals[day].meals[memberId]) tempDailyMeals[day].meals[memberId] = { lunch: 0, dinner: 0 };

    const parsedVal = val === "" ? 0 : (Number(val) || 0);
    tempDailyMeals[day].meals[memberId][type] = parsedVal;

    // ১. শুধু ওই নির্দিষ্ট লাইনের Total আপডেট
    const mMeal = tempDailyMeals[day].meals[memberId];
    const rowTotal = (Number(mMeal.lunch) || 0) + (Number(mMeal.dinner) || 0);
    const rowTotalEl = document.getElementById(`row-total-${memberId}`);
    if (rowTotalEl) rowTotalEl.innerText = rowTotal;

    // ২. নিচের টোটাল সামারি রো (Lunch, Dinner, Grand Total) আপডেট
    let totalLunch = 0;
    let totalDinner = 0;
    Object.values(tempDailyMeals[day].meals).forEach(m => {
        totalLunch += Number(m.lunch) || 0;
        totalDinner += Number(m.dinner) || 0;
    });

    const sumLunchEl = document.getElementById('sum-day-lunch');
    const sumDinnerEl = document.getElementById('sum-day-dinner');
    const sumGrandEl = document.getElementById('sum-day-grand');

    if (sumLunchEl) sumLunchEl.innerText = totalLunch;
    if (sumDinnerEl) sumDinnerEl.innerText = totalDinner;
    if (sumGrandEl) sumGrandEl.innerText = totalLunch + totalDinner;
}


// 🟢 [UPDATED] মেনু সিলেক্ট করলে টেম্পোরারিতে সেভ রাখা (Admin Check & Default Null Fix)
function updateDailyMenu() {
    if (!isAdmin) return; // Admin না হলে কোনো পরিবর্তন হবে না

    const day = document.getElementById('daily-date-select')?.value;
    if (!day) return; // তারিখ সিলেক্ট না থাকলে আপডেট হবে না

    const lMenu = document.getElementById('daily-lunch-menu')?.value || "Null";
    const dMenu = document.getElementById('daily-dinner-menu')?.value || "Null";

    if (!tempDailyMeals[day]) tempDailyMeals[day] = { lunchMenu: "Null", dinnerMenu: "Null", meals: {} };

    tempDailyMeals[day].lunchMenu = lMenu;
    tempDailyMeals[day].dinnerMenu = dMenu;
}

// 🟢 SUBMIT BUTTON HANDLER
function submitDailyMeals() {
    if (!isAdmin) {
        alert("শুধুমাত্র অনুমোদিত এডমিন ডাটা সেভ বা সাবমিট করতে পারবেন।");
        return;
    }

    const day = document.getElementById('daily-date-select')?.value;

    if (!day) {
        alert("অনুগ্রহ করে একটি তারিখ নির্বাচন করুন।");
        return;
    }

    if (tempDailyMeals[day]) {
        state.dailyMeals[day] = JSON.parse(JSON.stringify(tempDailyMeals[day]));
    }

    saveData(true);
    renderAll();

    alert(`Day ${day} এর মিল ডাটা সফলভাবে প্রোফাইলে যুক্ত এবং সেভ হয়েছে!`);
}

// INDIVIDUAL MEMBER DETAILS PAGE / MODAL HANDLERS
function openMemberModal(memberId) {
    const member = state.members.find(m => m.id === memberId);
    if (!member) return;

    // মডাল ওপেন হলে ওপরের ডানপাশে মাসের নাম বসাবে
    const monthEl = document.getElementById('modal-selected-month');
    if (monthEl) {
        monthEl.innerText = state.selectedMonth || 'August';
    }

    let memberLunch = 0;
    let memberDinner = 0;
    const menuCounts = {};

    const breakdownBody = document.getElementById('modal-member-breakdown-body');
    if (breakdownBody) breakdownBody.innerHTML = '';

    const activeDays = Object.keys(state.dailyMeals).map(Number).sort((a, b) => a - b);
    activeDays.forEach(day => {
        const dayInfo = state.dailyMeals[day];
        if (!dayInfo) return;
        const mMeal = dayInfo.meals?.[memberId] || { lunch: 0, dinner: 0 };
        const l = Number(mMeal.lunch) || 0;
        const d = Number(mMeal.dinner) || 0;
        memberLunch += l;
        memberDinner += d;

        const rawLunchMenu = dayInfo.lunchMenu || 'Null';
        const rawDinnerMenu = dayInfo.dinnerMenu || 'Null';

        // মিল ০ হলে এবং মেনু 'Not Cooked' হলে 'Not Cooked' দেখাবে, অন্যথায় 'Null'
        let lunchMenuName = '';
        if (l > 0) {
            lunchMenuName = rawLunchMenu;
        } else if (rawLunchMenu === "Not Cooked") {
            lunchMenuName = '<span class="text-[11px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 font-semibold">Not Cooked</span>';
        } else {
            lunchMenuName = '<span class="text-slate-500 italic">Null</span>';
        }

        let dinnerMenuName = '';
        if (d > 0) {
            dinnerMenuName = rawDinnerMenu;
        } else if (rawDinnerMenu === "Not Cooked") {
            dinnerMenuName = '<span class="text-[11px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 font-semibold">Not Cooked</span>';
        } else {
            dinnerMenuName = '<span class="text-slate-500 italic">Null</span>';
        }

        // মিল ১ বা তার বেশি হলে সামারির জন্য কাউন্ট রাখা
        if (l > 0) {
            menuCounts[rawLunchMenu] = (menuCounts[rawLunchMenu] || 0) + l;
        }
        if (d > 0) {
            menuCounts[rawDinnerMenu] = (menuCounts[rawDinnerMenu] || 0) + d;
        }

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-700/30 border-b border-slate-700/30";
        tr.innerHTML = `
            <td class="p-2.5 font-semibold text-slate-300">Day ${day} (${state.selectedMonth})</td>
            <td class="p-2.5 text-center font-bold text-amber-400">${l}</td>
            <td class="p-2.5 text-center font-bold text-indigo-400">${d}</td>
            <td class="p-2.5 text-center font-bold text-emerald-400 text-sm">${l + d}</td>
            
            <td class="p-2.5 text-slate-300">${lunchMenuName}</td>
            <td class="p-2.5 text-slate-300">${dinnerMenuName}</td>
        `;
        if (breakdownBody) breakdownBody.appendChild(tr);
    });

    const menuSummaryEl = document.getElementById('modal-member-menu-summary');
    if (menuSummaryEl) {
        menuSummaryEl.innerHTML = '';
        const entries = Object.entries(menuCounts);
        if (entries.length === 0) {
            menuSummaryEl.innerHTML = '<span class="text-slate-500 italic">No meals eaten yet</span>';
        } else {
            entries.forEach(([menuName, count]) => {
                const badge = document.createElement('span');
                badge.className = "bg-indigo-950/80 border border-indigo-500/40 text-indigo-300 font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-xs";
                badge.innerHTML = `<span>${menuName}:</span> <strong class="text-amber-400 font-black">${count}</strong>`;
                menuSummaryEl.appendChild(badge);
            });
        }
    }

    const totalMeals = memberLunch + memberDinner;
    let totalBazar = state.bazar.reduce((acc, c) => acc + (evaluateCostInput(c.cost) || 0), 0);
    let totalExtra = state.extra.reduce((acc, c) => acc + (evaluateCostInput(c.cost) || 0), 0);
    let globalTotalMeals = 0;

    Object.values(state.dailyMeals).forEach(d => {
        Object.values(d.meals || {}).forEach(m => {
            globalTotalMeals += (Number(m.lunch) || 0) + (Number(m.dinner) || 0);
        });
    });

    const mealRate = globalTotalMeals > 0 ? (totalBazar / globalTotalMeals) : 0;
    const extraShare = state.members.length > 0 ? (totalExtra / state.members.length) : 0;
    const mealCost = totalMeals * mealRate;
    const totalCost = mealCost + extraShare;

    const evaluatedDeposit = evaluateCostInput(member.deposit);
    const balance = evaluatedDeposit - totalCost;

    document.getElementById('modal-member-name').innerText = member.name;
    document.getElementById('modal-member-avatar').innerText = member.name.charAt(0).toUpperCase();
    document.getElementById('modal-member-deposit').innerText = `৳${evaluatedDeposit.toLocaleString()}`;
    document.getElementById('modal-member-meals').innerText = `${totalMeals} (${memberLunch}L + ${memberDinner}D)`;

    document.getElementById('modal-member-mealrate').innerText = `৳${mealRate.toFixed(2)}`;
    document.getElementById('modal-member-extracost').innerText = `৳${extraShare.toFixed(1)}`;

    document.getElementById('modal-member-mealcost').innerText = `৳${totalCost.toFixed(1)}`;

    const balEl = document.getElementById('modal-member-balance');
    balEl.innerText = `৳${balance.toFixed(1)}`;
    balEl.className = balance >= 0 ? "text-xl font-black text-emerald-400" : "text-xl font-black text-rose-400";

    document.getElementById('member-detail-modal').classList.remove('hidden');
}

function closeMemberModal() {
    document.getElementById('member-detail-modal').classList.add('hidden');
}

// MEMBERS TAB MANAGEMENT
function renderMembers() {
    // 🟢 নতুন যুক্ত করুন (মোবাইলের এক্টিভ পেজ কাউন্টার আপডেট করার জন্য)
    if (typeof refreshMobileIndicatorCount === 'function') refreshMobileIndicatorCount();

    const container = document.getElementById('members-container');
    if (!container) return;

    // 👇 এই দুই লাইন যুক্ত করুন (ডেস্কটপ ও মোবাইল কাউন্টার আপডেট করার জন্য)
    const countEl = document.getElementById('tab-member-count');
    const mobileCountEl = document.getElementById('mobile-tab-member-count');
    if (countEl) countEl.innerText = state.members.length;
    if (mobileCountEl) mobileCountEl.innerText = state.members.length;

    container.innerHTML = '';

    const disabledAttr = isAdmin ? '' : 'disabled';
    state.members.forEach((m, idx) => {
        const card = document.createElement('div');

        // [UPDATED] p-4 কমিয়ে p-2.5 sm:p-4 এবং space-y-3 কমিয়ে space-y-2 করা হয়েছে
        card.className = "bg-slate-800 p-2.5 sm:p-4 rounded-xl border border-slate-700 flex flex-col justify-between space-y-2 sm:space-y-3 shadow-md relative group cursor-pointer hover:border-indigo-500/50 transition";
        card.innerHTML = `
            <div class="border-b border-slate-700/60 pb-1.5 flex justify-between items-center" onclick="openMemberModal(${m.id})">
                <div class="overflow-hidden">
                    <label class="text-[9px] sm:text-[10px] uppercase text-slate-500 block font-semibold truncate">MEMBER #${m.id}</label>
                    <div class="flex items-center space-x-1.5 mt-0.5">
                        <i class="fa-solid fa-user text-indigo-400 text-xs sm:text-sm"></i>
                        <span class="text-slate-100 font-bold text-xs sm:text-base hover:text-indigo-400 truncate">${m.name}</span>
                    </div>
                </div>
                ${isAdmin ? `<button onclick="event.stopPropagation(); deleteMember(${idx})" title="Remove Member" class="text-rose-500 hover:text-rose-400 p-1 text-xs shrink-0"><i class="fa-solid fa-trash-can"></i></button>` : ''}
            </div>
            <div class="space-y-2 text-[11px] sm:text-xs">
                <div>
                    <label class="text-slate-400 block mb-0.5 text-[10px] sm:text-xs">Deposit (৳):</label>
                    <input type="text" value="${m.deposit}" ${disabledAttr}
                        onchange="updateMemberDeposit(${idx}, this.value)"
                        placeholder="e.g. 2000+1000"
                        class="bg-slate-900 border border-slate-700 rounded px-2 py-1 w-full text-emerald-400 font-bold text-xs sm:text-sm focus:outline-none focus:border-emerald-500 disabled:bg-slate-800/50">
                </div>
                <div class="grid grid-cols-2 gap-1.5 sm:gap-2" onclick="event.stopPropagation();">
                    <div>
                        <label class="text-slate-400 block mb-0.5 text-[10px] sm:text-xs">Lunch:</label>
                        <input type="text" readonly id="m-lunch-${idx}" value="0" class="bg-slate-900 border border-slate-700 rounded px-1.5 sm:px-2.5 py-1 w-full text-slate-200 font-bold text-xs sm:text-sm cursor-default focus:outline-none">
                    </div>
                    <div>
                        <label class="text-slate-400 block mb-0.5 text-[10px] sm:text-xs">Dinner:</label>
                        <input type="text" readonly id="m-dinner-${idx}" value="0" class="bg-slate-900 border border-slate-700 rounded px-1.5 sm:px-2.5 py-1 w-full text-slate-200 font-bold text-xs sm:text-sm cursor-default focus:outline-none">
                    </div>
                </div>
            </div>
            <div class="pt-2 sm:pt-3 border-t border-slate-700/60 text-[11px] sm:text-xs space-y-1 sm:space-y-2" onclick="openMemberModal(${m.id})">
                <div class="flex justify-between text-slate-300 items-center"><span class="text-slate-400">Meals:</span><span class="font-black text-slate-100 text-xs sm:text-base" id="m-meals-${idx}">0</span></div>
                <div class="flex justify-between text-slate-300 items-center"><span class="text-slate-400">Extra:</span><span class="font-extrabold text-pink-400 text-xs sm:text-sm" id="m-extra-${idx}">৳0</span></div>
                <div class="flex justify-between text-slate-300 items-center"><span class="text-slate-400">Est. Cost:</span><span class="font-extrabold text-rose-400 text-xs sm:text-sm" id="m-cost-${idx}">৳0</span></div>
                <div class="flex justify-between text-slate-100 font-extrabold pt-1.5 sm:pt-2 border-t border-slate-700/40 items-center"><span>Balance:</span><span id="m-balance-${idx}" class="text-xs sm:text-sm">৳0</span></div>
            </div>
        `;
        container.appendChild(card);
    });
}

function addMember() {

    if (!isAdmin) return;

    // Firebase থেকে null এলে empty array বানাবে
    if (!Array.isArray(state.members)) {
        state.members = [];
    }

    const input = document.getElementById('new-member-name');

    if (!input) {
        console.error("❌ new-member-name input পাওয়া যায়নি");
        return;
    }

    const name = input.value.trim();

    if (!name) {
        alert("মেম্বারের নাম লিখুন!");
        return;
    }

    const newId =
        state.members.length > 0
            ? Math.max(...state.members.map(m => Number(m.id) || 0)) + 1
            : 1;

    state.members.push({
        id: newId,
        name: name,
        deposit: 0
    });

    input.value = '';

    renderAll();

    saveData(false);

    console.log("✅ Member added:", name);
}

function deleteMember(idx) {

    if (!isAdmin) return;

    if (!Array.isArray(state.members)) {
        state.members = [];
        renderAll();
        saveData(false);
        return;
    }

    if (!state.members[idx]) return;

    if (
        confirm(
            `আপনি কি "${state.members[idx].name}" কে বাদ দিতে চান?`
        )
    ) {

        state.members.splice(idx, 1);

        renderAll();

        saveData(false);

        console.log("✅ Member deleted");
    }
}

function updateMemberDeposit(index, val) {
    if (!isAdmin) return;
    const evaluated = evaluateCostInput(val);
    state.members[index].deposit = evaluated;
    renderMembers();
    calculateAll();
    renderSummary();
    saveData(false);
}

function evaluateCostInput(val) {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    try {
        const sanitized = val.replace(/[^0-9+\-*/.]/g, '');
        if (!sanitized) return 0;
        const result = Function(`"use strict"; return (${sanitized})`)();
        return isNaN(result) ? 0 : Number(result);
    } catch (e) {
        return Number(parseFloat(val)) || 0;
    }
}

// BAZAR & EXTRA RENDERERS

function renderBazar() {
    const tbody = document.getElementById('bazar-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    state.bazar.forEach((item, idx) => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-700/50 hover:bg-slate-700/20 transition";
        tr.innerHTML = `
            <!-- Item Name: break-words ও leading-tight ব্যবহার করা হয়েছে যাতে বড় নামও স্পষ্ট পুরো দেখায় -->
            <td class="py-2.5 px-2 text-xs sm:text-sm text-slate-100 font-medium break-words max-w-[120px] sm:max-w-none leading-tight">
                ${item.name || '-'}
            </td>
            <!-- Date: whitespace-nowrap দেওয়া হয়েছে যাতে তারিখ ভেঙে না যায় -->
            <td class="py-2.5 px-1 sm:px-2 text-[10px] sm:text-xs text-slate-400 whitespace-nowrap">
                ${item.date || '-'}
            </td>
            <!-- Qty -->
            <td class="py-2.5 px-1 sm:px-2 text-xs text-slate-300 text-center whitespace-nowrap">
                ${item.qty || '-'}
            </td>
            <!-- Cost -->
            <td class="py-2.5 px-1 sm:px-2 text-xs sm:text-sm text-emerald-400 font-bold text-right whitespace-nowrap">
                ৳${evaluateCostInput(item.cost) || 0}
            </td>
            <!-- Action Buttons -->
            ${isAdmin ? `
            <td class="py-2.5 px-1 text-center whitespace-nowrap space-x-1">
                <button onclick="editBazarModal(${idx})" class="text-indigo-400 hover:text-indigo-300 p-1" title="Edit">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button onclick="deleteBazar(${idx})" class="text-rose-400 hover:text-rose-300 p-1" title="Delete">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>` : ''}
        `;
        tbody.appendChild(tr);
    });
}

function renderExtra() {
    const tbody = document.getElementById('extra-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    state.extra.forEach((item, idx) => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-700/50 hover:bg-slate-700/20 transition";
        tr.innerHTML = `
            <!-- Item Name -->
            <td class="py-2.5 px-2 text-xs sm:text-sm text-slate-100 font-medium break-words max-w-[120px] sm:max-w-none leading-tight">
                ${item.name || '-'}
            </td>
            <!-- Date -->
            <td class="py-2.5 px-1 sm:px-2 text-[10px] sm:text-xs text-slate-400 whitespace-nowrap">
                ${item.date || '-'}
            </td>
            <!-- Qty -->
            <td class="py-2.5 px-1 sm:px-2 text-xs text-slate-300 text-center whitespace-nowrap">
                ${item.qty || '-'}
            </td>
            <!-- Cost -->
            <td class="py-2.5 px-1 sm:px-2 text-xs sm:text-sm text-pink-400 font-bold text-right whitespace-nowrap">
                ৳${evaluateCostInput(item.cost) || 0}
            </td>
            <!-- Action Buttons -->
            ${isAdmin ? `
            <td class="py-2.5 px-1 text-center whitespace-nowrap space-x-1">
                <button onclick="editExtraModal(${idx})" class="text-pink-400 hover:text-pink-300 p-1" title="Edit">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button onclick="deleteExtra(${idx})" class="text-rose-400 hover:text-rose-300 p-1" title="Delete">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>` : ''}
        `;
        tbody.appendChild(tr);
    });
}

// 🟢 MODAL OPENERS & HANDLERS

function addBazarRow() {
    if (!isAdmin) return;
    document.getElementById('bazar-form').reset();
    document.getElementById('modal-bazar-index').value = '';
    document.getElementById('modal-bazar-date').value = getSelectedMonthDefaultDate();
    document.getElementById('bazar-modal-title').innerText = "Add Bazar Item";
    document.getElementById('bazar-modal').classList.remove('hidden');
}

function addExtraRow() {
    if (!isAdmin) return;
    document.getElementById('extra-form').reset();
    document.getElementById('modal-extra-index').value = '';
    document.getElementById('modal-extra-date').value = getSelectedMonthDefaultDate();
    document.getElementById('extra-modal-title').innerText = "Add Extra Expense";
    document.getElementById('extra-modal').classList.remove('hidden');
}

function editBazarModal(idx) {
    if (!isAdmin) return;
    const item = state.bazar[idx];
    document.getElementById('modal-bazar-index').value = idx;
    document.getElementById('modal-bazar-name').value = item.name || '';
    document.getElementById('modal-bazar-date').value = item.date || getSelectedMonthDefaultDate();
    document.getElementById('modal-bazar-qty').value = item.qty || '';
    document.getElementById('modal-bazar-cost').value = item.cost || '';
    document.getElementById('bazar-modal-title').innerText = "Edit Bazar Item";
    document.getElementById('bazar-modal').classList.remove('hidden');
}

function editExtraModal(idx) {
    if (!isAdmin) return;
    const item = state.extra[idx];
    document.getElementById('modal-extra-index').value = idx;
    document.getElementById('modal-extra-name').value = item.name || '';
    document.getElementById('modal-extra-date').value = item.date || getSelectedMonthDefaultDate();
    document.getElementById('modal-extra-qty').value = item.qty || '';
    document.getElementById('modal-extra-cost').value = item.cost || '';
    document.getElementById('extra-modal-title').innerText = "Edit Extra Expense";
    document.getElementById('extra-modal').classList.remove('hidden');
}

function closeBazarModal() {
    document.getElementById('bazar-modal').classList.add('hidden');
}

function closeExtraModal() {
    document.getElementById('extra-modal').classList.add('hidden');
}

function saveBazarModal(e) {
    e.preventDefault();
    if (!isAdmin) return;
    const idx = document.getElementById('modal-bazar-index').value;
    const name = document.getElementById('modal-bazar-name').value;
    const date = document.getElementById('modal-bazar-date').value;
    const qty = document.getElementById('modal-bazar-qty').value;
    const rawCost = document.getElementById('modal-bazar-cost').value;

    if (idx !== '') {
        state.bazar[idx] = { ...state.bazar[idx], name, date, qty, cost: rawCost };
    } else {
        state.bazar.push({ id: Date.now(), name, date, qty, cost: rawCost });
    }

    closeBazarModal();
    renderBazar();
    calculateAll();
    renderSummary();
    saveData(false);
}

function saveExtraModal(e) {
    e.preventDefault();
    if (!isAdmin) return;
    const idx = document.getElementById('modal-extra-index').value;
    const name = document.getElementById('modal-extra-name').value;
    const date = document.getElementById('modal-extra-date').value;
    const qty = document.getElementById('modal-extra-qty').value;
    const rawCost = document.getElementById('modal-extra-cost').value;

    if (idx !== '') {
        state.extra[idx] = { ...state.extra[idx], name, date, qty, cost: rawCost };
    } else {
        state.extra.push({ id: Date.now(), name, date, qty, cost: rawCost });
    }

    closeExtraModal();
    renderExtra();
    calculateAll();
    renderSummary();
    saveData(false);
}

// 🟢 EXISTING COMPATIBILITY & UTILITY FUNCTIONS

function deleteBazar(idx) {
    if (!isAdmin) return;
    state.bazar.splice(idx, 1);
    renderBazar();
    calculateAll();
    renderSummary();
    saveData(false);
}

function deleteExtra(idx) {
    if (!isAdmin) return;
    state.extra.splice(idx, 1);
    renderExtra();
    calculateAll();
    renderSummary();
    saveData(false);
}

function updateBazar(index, key, val) {
    if (!isAdmin) return;
    state.bazar[index][key] = key === 'cost' ? evaluateCostInput(val) : val;
    calculateAll();
    renderSummary();
    saveData(false);
}

function updateExtra(index, key, val) {
    if (!isAdmin) return;
    state.extra[index][key] = key === 'cost' ? evaluateCostInput(val) : val;
    calculateAll();
    renderSummary();
    saveData(false);
}

function updateBazarCost(index, val, type) {
    if (!isAdmin) return;
    const evaluated = evaluateCostInput(val);
    if (type === 'bazar') {
        state.bazar[index].cost = evaluated;
        renderBazar();
    } else {
        state.extra[index].cost = evaluated;
        renderExtra();
    }
    calculateAll();
    renderSummary();
    saveData(false);
}

function getSelectedMonthDefaultDate() {
    const activeMonth = state?.currentMonth || new Date().toISOString().slice(0, 7);
    const today = new Date();
    const todayMonth = today.toISOString().slice(0, 7);

    if (activeMonth === todayMonth) {
        return today.toISOString().split('T')[0];
    } else {
        return `${activeMonth}-01`;
    }
}


// MAIN CALCULATIONS ENGINE
function calculateAll() {
    let totalDeposit = 0;
    let totalLunch = 0;
    let totalDinner = 0;

    // 🟢 [UPDATED DATA STRUCTURE] মেনুর নাম অনুযায়ী মিল ও বেলার সংখ্যা রাখার জন্য
    // overallMenuSummary = { "Chicken": { totalMeals: 12, totalSessions: 3 } }
    const overallMenuSummary = {};

    Object.values(state.dailyMeals).forEach(dayData => {
        const lMenu = dayData.lunchMenu || "Fixed";
        const dMenu = dayData.dinnerMenu || "Fixed";

        let dayLunchCount = 0;
        let dayDinnerCount = 0;

        // প্রতিটি মেম্বারের দুপুর ও রাতের মিল গণনা
        Object.values(dayData.meals || {}).forEach(m => {
            const lVal = Number(m.lunch) || 0;
            const dVal = Number(m.dinner) || 0;
            totalLunch += lVal;
            totalDinner += dVal;

            dayLunchCount += lVal;
            dayDinnerCount += dVal;
        });

        // 🟢 দুপুরের মেনুর হিসেব ও বেলা (Session) কাউন্ট
        if (dayLunchCount > 0 && lMenu !== "Not Cooked" && lMenu !== "Null") {
            if (!overallMenuSummary[lMenu]) {
                overallMenuSummary[lMenu] = { totalMeals: 0, totalSessions: 0 };
            }
            overallMenuSummary[lMenu].totalMeals += dayLunchCount;
            overallMenuSummary[lMenu].totalSessions += 1; // ১ বেলা বাড়ল
        }

        // 🟢 রাতের মেনুর হিসেব ও বেলা (Session) কাউন্ট
        if (dayDinnerCount > 0 && dMenu !== "Not Cooked" && dMenu !== "Null") {
            if (!overallMenuSummary[dMenu]) {
                overallMenuSummary[dMenu] = { totalMeals: 0, totalSessions: 0 };
            }
            overallMenuSummary[dMenu].totalMeals += dayDinnerCount;
            overallMenuSummary[dMenu].totalSessions += 1; // ১ বেলা বাড়ল
        }
    });

    const memberCount = state.members.length;
    const totalMeals = totalLunch + totalDinner;

    state.members.forEach(m => {
        totalDeposit += evaluateCostInput(m.deposit);
    });

    let totalBazar = state.bazar.reduce((acc, curr) => acc + (evaluateCostInput(curr.cost) || 0), 0);
    let totalExtra = state.extra.reduce((acc, curr) => acc + (evaluateCostInput(curr.cost) || 0), 0);

    const totalOverallExpense = totalBazar + totalExtra;
    const cashInHand = totalDeposit - totalOverallExpense;
    const mealRate = totalMeals > 0 ? (totalBazar / totalMeals) : 0;
    const extraPerMember = memberCount > 0 ? (totalExtra / memberCount) : 0;

    const setElemText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    };

    setElemText('tab-member-count', memberCount);
    setElemText('dash-extra-member-count', memberCount);
    setElemText('dash-total-deposit', `৳${totalDeposit.toLocaleString()}`);
    setElemText('dash-total-expense', `৳${totalOverallExpense.toLocaleString()}`);
    setElemText('dash-cash-in-hand', `৳${cashInHand.toLocaleString()}`);
    setElemText('dash-meal-rate', `৳${mealRate.toFixed(2)}`);
    setElemText('dash-total-lunch', totalLunch);
    setElemText('dash-total-dinner', totalDinner);
    setElemText('dash-total-meals', totalMeals);
    setElemText('dash-extra-total', `৳${totalExtra.toLocaleString()}`);
    setElemText('dash-extra-per-member', `৳${extraPerMember.toFixed(2)}`);
    setElemText('bazar-total-display', `৳${totalBazar.toLocaleString()}`);
    setElemText('extra-total-display', `৳${totalExtra.toLocaleString()}`);

    // 🟢 [UPDATED UI] ড্যাশবোর্ডে মেনুর কার্ডগুলোতে বেলার সংখ্যাসহ ডিসপ্লে
    const dashMenuContainer = document.getElementById('dash-menu-consumption-container');
    if (dashMenuContainer) {
        dashMenuContainer.innerHTML = '';
        const entries = Object.entries(overallMenuSummary);
        if (entries.length === 0) {
            dashMenuContainer.innerHTML = '<div class="col-span-full text-slate-500 text-xs italic">এখনও কোনো খাবারের এন্ট্রি করা হয়নি।</div>';
        } else {
            entries.forEach(([menuName, data]) => {
                const card = document.createElement('div');
                card.className = "bg-slate-900/80 p-3 rounded-xl border border-slate-700/60 flex flex-col justify-between";
                card.innerHTML = `
                    <span class="text-xs text-slate-400 font-semibold truncate block mb-2">${menuName}</span>
                    <div class="flex items-baseline justify-between gap-1">
                        <div class="text-lg font-black text-amber-400">${data.totalMeals} <span class="text-[10px] text-slate-500 font-normal">Meals</span></div>
                        <div class="text-[11px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded">
                            <i class="fa-regular fa-clock text-[9px]"></i> ${data.totalSessions} বেলা
                        </div>
                    </div>
                `;
                dashMenuContainer.appendChild(card);
            });
        }
    }

    state.members.forEach((m, idx) => {
        let memberLunch = 0;
        let memberDinner = 0;
        Object.values(state.dailyMeals).forEach(d => {
            const mMeal = d.meals?.[m.id];
            if (mMeal) {
                memberLunch += Number(mMeal.lunch) || 0;
                memberDinner += Number(mMeal.dinner) || 0;
            }
        });

        const mTotalMeals = memberLunch + memberDinner;
        const totalMemberCost = (mTotalMeals * mealRate) + extraPerMember;
        const balance = evaluateCostInput(m.deposit) - totalMemberCost;

        const lInput = document.getElementById(`m-lunch-${idx}`);
        const dInput = document.getElementById(`m-dinner-${idx}`);
        if (lInput) lInput.value = memberLunch;
        if (dInput) dInput.value = memberDinner;

        setElemText(`m-meals-${idx}`, `${mTotalMeals}`);
        setElemText(`m-extra-${idx}`, `৳${extraPerMember.toFixed(1)}`);
        setElemText(`m-cost-${idx}`, `৳${totalMemberCost.toFixed(1)}`);

        const balElem = document.getElementById(`m-balance-${idx}`);
        if (balElem) {
            balElem.innerText = `৳${balance.toFixed(1)}`;
            balElem.className = balance >= 0 ? "font-black text-emerald-400 text-base" : "font-black text-rose-400 text-base";
        }
    });
}

// FINAL SUMMARY PAGE RENDERING & AUTOMATION
function renderSummary() {
    const tbody = document.getElementById('summary-table-body');
    const mobileCards = document.getElementById('summary-mobile-cards');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (mobileCards) mobileCards.innerHTML = ''; // মোবাইল কন্টেইনার খালি করা

    const monthName = state?.selectedMonth || "August";
    const monthHeader = document.getElementById('summary-month-name');
    if (monthHeader) monthHeader.innerText = monthName;

    // সেফটি চেক সহ টোটাল বাজার ও এক্সট্রা খরচ বের করা
    let totalBazar = (state?.bazar || []).reduce((acc, curr) => acc + (evaluateCostInput(curr.cost) || 0), 0);
    let totalExtra = (state?.extra || []).reduce((acc, curr) => acc + (evaluateCostInput(curr.cost) || 0), 0);
    let globalTotalMeals = 0;

    // dailyMeals আনডিফাইন্ড থাকলে ক্র্যাশ করবে না
    if (state?.dailyMeals) {
        Object.values(state.dailyMeals).forEach(dayData => {
            Object.values(dayData.meals || {}).forEach(m => {
                globalTotalMeals += (Number(m.lunch) || 0) + (Number(m.dinner) || 0);
            });
        });
    }

    const mealRate = globalTotalMeals > 0 ? (totalBazar / globalTotalMeals) : 0;
    const memberCount = state?.members ? state.members.length : 0;
    const extraPerMember = memberCount > 0 ? (totalExtra / memberCount) : 0;

    // isAdmin সেফটি চেক
    const checkAdmin = (typeof isAdmin !== 'undefined') ? isAdmin : false;
    const isDis = checkAdmin ? '' : 'disabled';

    if (state?.members && state.members.length > 0) {
        state.members.forEach((m) => {
            let memberLunch = 0;
            let memberDinner = 0;

            if (state?.dailyMeals) {
                Object.values(state.dailyMeals).forEach(d => {
                    const mMeal = d.meals?.[m.id];
                    if (mMeal) {
                        memberLunch += Number(mMeal.lunch) || 0;
                        memberDinner += Number(mMeal.dinner) || 0;
                    }
                });
            }

            const totalMeals = memberLunch + memberDinner;
            const mealCost = totalMeals * mealRate;
            const totalAllCost = mealCost + extraPerMember;
            const deposit = evaluateCostInput(m.deposit) || 0;
            const balance = deposit - totalAllCost;
            let roundedBalance = Math.round(balance);

            // --- ১. ডেসকটপ ভিউ (Table Row) ---
            const tr = document.createElement('tr');
            tr.className = "border-b border-slate-700/50 hover:bg-slate-800/40 transition";
            tr.innerHTML = `
                <td class="p-3 font-bold text-slate-100 text-sm sm:text-base">
                    <i class="fa-solid fa-user-check text-indigo-400 mr-1.5 text-sm"></i> ${m.name}
                </td>
                <td class="p-3 text-center font-bold text-emerald-400 text-sm sm:text-base">৳${deposit.toLocaleString()}</td>
                <td class="p-3 text-center font-bold text-amber-400 text-sm sm:text-base">${totalMeals}</td>
                <td class="p-3 text-center text-cyan-400 font-semibold text-xs sm:text-sm">৳${mealRate.toFixed(2)}</td>
                <td class="p-3 text-center text-rose-300 font-semibold text-xs sm:text-sm">৳${mealCost.toFixed(2)}</td>
                <td class="p-3 text-center text-pink-300 font-semibold text-xs sm:text-sm">৳${extraPerMember.toFixed(2)}</td>
                <td class="p-3 text-center font-black text-rose-400 text-sm sm:text-base">৳${totalAllCost.toFixed(2)}</td>
                <td class="p-3 text-right">
                    <div class="flex items-center justify-end gap-3">
                        <span class="status-text font-black text-base sm:text-lg uppercase tracking-wide"></span>
                        <input type="number"
                            value="${roundedBalance}"
                            ${isDis}
                            onkeyup="handleSettlementText(this)"
                            onchange="handleSettlementText(this)"
                            onclick="this.select()"
                            class="bg-slate-900 border border-slate-700 text-center rounded-lg p-1.5 w-24 font-bold text-sm sm:text-base focus:outline-none focus:border-indigo-500 shadow-inner transition"
                        >
                    </div>
                </td>
            `;
            tbody.appendChild(tr);

            // --- ২. মোবাইল ভিউ (Card View) ---
            if (mobileCards) {
                const card = document.createElement('div');
                card.className = "bg-slate-900/90 border border-slate-700 rounded-xl p-3 space-y-3 shadow-md";
                card.innerHTML = `
                    <div class="flex justify-between items-center border-b border-slate-700/60 pb-2">
                        <span class="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                            <i class="fa-solid fa-user-check text-indigo-400 text-xs"></i> ${m.name}
                        </span>
                        <div class="flex items-center gap-2">
                            <span class="status-text font-black text-xs uppercase tracking-wide"></span>
                            <input type="number"
                                value="${roundedBalance}"
                                ${isDis}
                                onkeyup="handleSettlementText(this)"
                                onchange="handleSettlementText(this)"
                                onclick="this.select()"
                                class="bg-slate-800 border border-slate-700 text-center rounded-md p-1 w-20 font-bold text-xs focus:outline-none focus:border-indigo-500 shadow-inner transition"
                            >
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-2 text-xs">
                        <div class="bg-slate-800/60 p-2 rounded border border-slate-700/40">
                            <span class="text-slate-400 block text-[10px]">Deposit</span>
                            <strong class="text-emerald-400">৳${deposit.toLocaleString()}</strong>
                        </div>
                        <div class="bg-slate-800/60 p-2 rounded border border-slate-700/40">
                            <span class="text-slate-400 block text-[10px]">Total Meal</span>
                            <strong class="text-amber-400">${totalMeals} <span class="text-[9px] text-cyan-400 font-normal">(Rate: ৳${mealRate.toFixed(2)})</span></strong>
                        </div>
                        <div class="bg-slate-800/60 p-2 rounded border border-slate-700/40">
                            <span class="text-slate-400 block text-[10px]">Meal Cost</span>
                            <strong class="text-rose-300">৳${mealCost.toFixed(2)}</strong>
                        </div>
                        <div class="bg-slate-800/60 p-2 rounded border border-slate-700/40">
                            <span class="text-slate-400 block text-[10px]">Extra Cost</span>
                            <strong class="text-pink-300">৳${extraPerMember.toFixed(2)}</strong>
                        </div>
                    </div>

                    <div class="pt-1 flex justify-between items-center text-xs border-t border-slate-700/40">
                        <span class="text-slate-400 font-medium">Total All Cost:</span>
                        <span class="font-black text-rose-400 text-sm">৳${totalAllCost.toFixed(2)}</span>
                    </div>
                `;
                mobileCards.appendChild(card);
            }
        });
    }

    // ইনপুট ফিল্ডগুলোতে স্ট্যাটাস টেক্সট আপডেট
    if (typeof handleSettlementText === 'function') {
        document.querySelectorAll('#sec-summary input[type="number"]').forEach(input => {
            handleSettlementText(input);
        });
    }
}

// PDF / Print ডাউনলোড ফাংশন
function downloadSummaryPDF() {
    const checkAdmin = (typeof isAdmin !== 'undefined') ? isAdmin : false;
    if (!checkAdmin) {
        alert("শুধুমাত্র অ্যাডমিন রিপোর্ট ডাউনলোড করতে পারবেন!");
        return;
    }

    const monthName = state?.selectedMonth || "August";
    let totalBazar = (state?.bazar || []).reduce((acc, curr) => acc + (evaluateCostInput(curr.cost) || 0), 0);
    let totalExtra = (state?.extra || []).reduce((acc, curr) => acc + (evaluateCostInput(curr.cost) || 0), 0);
    let globalTotalMeals = 0;

    if (state?.dailyMeals) {
        Object.values(state.dailyMeals).forEach(dayData => {
            Object.values(dayData.meals || {}).forEach(m => {
                globalTotalMeals += (Number(m.lunch) || 0) + (Number(m.dinner) || 0);
            });
        });
    }

    const mealRate = globalTotalMeals > 0 ? (totalBazar / globalTotalMeals) : 0;
    const memberCount = state?.members ? state.members.length : 0;
    const extraPerMember = memberCount > 0 ? (totalExtra / memberCount) : 0;

    let printRows = '';
    if (state?.members) {
        state.members.forEach((m) => {
            let memberLunch = 0;
            let memberDinner = 0;

            if (state?.dailyMeals) {
                Object.values(state.dailyMeals).forEach(d => {
                    const mMeal = d.meals?.[m.id];
                    if (mMeal) {
                        memberLunch += Number(mMeal.lunch) || 0;
                        memberDinner += Number(mMeal.dinner) || 0;
                    }
                });
            }

            const totalMeals = memberLunch + memberDinner;
            const mealCost = totalMeals * mealRate;
            const totalAllCost = mealCost + extraPerMember;
            const deposit = evaluateCostInput(m.deposit) || 0;
            const balance = deposit - totalAllCost;
            let roundedBalance = Math.round(balance);

            let statusText = "GOOD FINISH";
            let statusColor = "#10b981";
            if (roundedBalance > 0) {
                statusText = `You Get: ৳${roundedBalance}`;
                statusColor = "#10b981";
            } else if (roundedBalance < 0) {
                statusText = `You Pay: ৳${Math.abs(roundedBalance)}`;
                statusColor = "#f43f5e";
            }

            printRows += `
                <tr style="border-bottom: 1px solid #ddd; text-align: center;">
                    <td style="padding: 10px; text-align: left; font-weight: bold;">${m.name}</td>
                    <td style="padding: 10px;">৳${deposit.toLocaleString()}</td>
                    <td style="padding: 10px; font-weight: bold;">${totalMeals}</td>
                    <td style="padding: 10px;">৳${mealRate.toFixed(2)}</td>
                    <td style="padding: 10px;">৳${mealCost.toFixed(2)}</td>
                    <td style="padding: 10px;">৳${extraPerMember.toFixed(2)}</td>
                    <td style="padding: 10px; font-weight: bold; color: #e11d48;">৳${totalAllCost.toFixed(2)}</td>
                    <td style="padding: 10px; font-weight: bold; color: ${statusColor}; text-align: right;">${statusText}</td>
                </tr>
            `;
        });
    }

    const printWindow = window.open('', '', 'width=900,height=700');
    printWindow.document.write(`
        <html>
        <head>
            <title>Summary Report - ${monthName}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
                .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
                .header h1 { margin: 0; font-size: 22px; }
                .header p { margin: 5px 0 0 0; color: #666; font-size: 13px; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
                th { background-color: #1e293b; color: #fff; padding: 10px; text-transform: uppercase; font-size: 11px; }
                .footer { margin-top: 30px; text-align: right; font-size: 11px; color: #777; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Monthly Final Summary Report</h1>
                <p>Month: <strong>${monthName}</strong> | Total Bazar: ৳${totalBazar} | Meal Rate: ৳${mealRate.toFixed(2)}</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th style="text-align: left;">Member Name</th>
                        <th>Deposit</th>
                        <th>Total Meal</th>
                        <th>Meal Rate</th>
                        <th>Meal Cost</th>
                        <th>Extra Cost</th>
                        <th>Total All Cost</th>
                        <th style="text-align: right;">Final Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${printRows}
                </tbody>
            </table>
            <div class="footer">
                <p>Generated automatically on ${new Date().toLocaleDateString()}</p>
            </div>
        </body>
        </html>
    `);

    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
}


function handleSettlementText(input) {
    const val = parseFloat(input.value) || 0;
    const statusSpan = input.previousElementSibling;

    if (val === 0) {
        statusSpan.innerHTML = '<span class="text-emerald-400 font-black text-base sm:text-lg drop-shadow-md flex items-center gap-1"><i class="fa-solid fa-circle-check"></i> GOOD FINISH</span>';
        input.className = "bg-slate-900 border-2 border-emerald-500 text-emerald-400 text-center rounded-lg p-1.5 w-24 font-black text-sm sm:text-base focus:outline-none shadow-[0_0_12px_rgba(52,211,153,0.35)] transition-all";
    } else if (val > 0) {
        statusSpan.innerHTML = `<span class="text-emerald-400 font-extrabold text-sm sm:text-base">You Get: +৳${val}</span>`;
        input.className = "bg-slate-900 border border-slate-700 text-emerald-400 text-center rounded-lg p-1.5 w-24 font-bold text-sm sm:text-base focus:outline-none focus:border-emerald-500 transition-all";
    } else {
        statusSpan.innerHTML = `<span class="text-rose-500 font-extrabold text-sm sm:text-base">You Pay: -৳${Math.abs(val)}</span>`;
        input.className = "bg-slate-900 border border-slate-700 text-rose-500 text-center rounded-lg p-1.5 w-24 font-bold text-sm sm:text-base focus:outline-none focus:border-rose-500 transition-all";
    }
}


// ==========================================
// STORAGE + FIREBASE REAL-TIME CLOUD SAVE
// ==========================================

function saveData(showAlert = false) {

    if (!isAdmin && showAlert) {
        alert("শুধুমাত্র অ্যাডমিন ক্লাউড ব্যাকআপ দিতে পারবেন!");
        return;
    }

    const monthDropdown = document.getElementById('selected-month');

    if (monthDropdown) {
        state.selectedMonth = monthDropdown.value;
    }

    // Make sure Firebase never receives invalid array values
    state.members = Array.isArray(state.members) ? state.members : [];
    state.bazar = Array.isArray(state.bazar) ? state.bazar : [];
    state.extra = Array.isArray(state.extra) ? state.extra : [];
    state.dailyMeals = state.dailyMeals || {};

    // 1. Local backup
    localStorage.setItem(
        'bachelor_brotherhood_db',
        JSON.stringify(state)
    );

    // 2. Firebase Save
    if (firebaseReady) {

        firebaseDataRef.set(state)
            .then(() => {

                console.log("✅ Data successfully saved to Firebase");

                // 3. Google Sheet backup only when requested
                if (showAlert) {
                    syncToGoogleSheets();
                }

            })
            .catch((error) => {

                console.error(
                    "❌ Firebase save error:",
                    error
                );

                alert(
                    "Firebase-এ data save করতে সমস্যা হয়েছে। Internet connection check করুন।"
                );
            });

    } else {

        console.warn(
            "⚠️ Firebase এখনও ready হয়নি।"
        );

        if (showAlert) {
            syncToGoogleSheets();
        }
    }
}

function syncToGoogleSheets() {
    if (!GOOGLE_SHEET_WEBHOOK_URL || GOOGLE_SHEET_WEBHOOK_URL.includes("YOUR_GOOGLE")) {
        alert("লোকাল স্টোরেজে ডাটা সেভ হয়েছে! গুগল শিটে ব্যাকআপ পেতে script.js ফাইলে Webhook URL যুক্ত করুন।");
        return;
    }

    const payload = {
        // 🟢 এই নিচের লাইনটিতে পরিবর্তন করা হয়েছে (নির্দিষ্ট মাসের বদলে ডাইনামিক চলতি মাস ব্যাকআপ হবে)
        month: state.selectedMonth || new Date().toLocaleString('en-US', { month: 'long' }),
        members: state.members,
        bazar: state.bazar,
        extra: state.extra,
        dailyMeals: state.dailyMeals
    };

    fetch(GOOGLE_SHEET_WEBHOOK_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).then(() => alert(`ডাটা সফলভাবে সেভ হয়েছে এবং (${payload.month}) মাসের ব্যাকআপ Google Sheet-এ জমা হয়েছে!`))
        .catch(err => {
            console.error("Cloud Backup Error: ", err);
            alert('লোকালে সেভ হয়েছে, তবে গুগল শিটে পাঠাতে সমস্যা হয়েছে।');
        });
}

// ==========================================
// LOAD DATA FROM FIREBASE + REAL-TIME SYNC
// ==========================================

function initializeFirebaseSync() {

    // First, load local data temporarily
    const saved = localStorage.getItem('bachelor_brotherhood_db');

    if (saved) {
        try {
            state = JSON.parse(saved);

            if (!state.dailyMeals) {
                state.dailyMeals = {};
            }

        } catch (e) {
            console.error("Error loading local saved state", e);
        }
    }

    // Listen for Firebase changes in real-time
    firebaseDataRef.on('value', (snapshot) => {

        if (snapshot.exists()) {

            const firebaseState = snapshot.val() || {};

            // Firebase থেকে data নেওয়ার সময়
            // সব প্রয়োজনীয় structure ঠিক রাখা হচ্ছে
            state = {
                selectedMonth: firebaseState.selectedMonth || "January",

                members: Array.isArray(firebaseState.members)
                    ? firebaseState.members
                    : [],

                bazar: Array.isArray(firebaseState.bazar)
                    ? firebaseState.bazar
                    : [],

                extra: Array.isArray(firebaseState.extra)
                    ? firebaseState.extra
                    : [],

                dailyMeals: firebaseState.dailyMeals || {}
            };

            // Local backup
            localStorage.setItem(
                'bachelor_brotherhood_db',
                JSON.stringify(state)
            );

            firebaseReady = true;

            // Update top month dropdown from Firebase
            const monthDropdown = document.getElementById('selected-month');

            if (monthDropdown && state.selectedMonth) {
                monthDropdown.value = state.selectedMonth;
            }

            // Website automatically update
            renderAll();

            console.log("✅ Data received from Firebase");
        }

        else {

            // Firebase is empty → upload current data
            firebaseDataRef.set(state)
                .then(() => {
                    firebaseReady = true;

                    console.log("✅ Initial data uploaded to Firebase");

                    renderAll();
                })
                .catch((error) => {
                    console.error(
                        "❌ Firebase initial upload error:",
                        error
                    );
                });
        }

    }, (error) => {

        console.error("❌ Firebase connection error:", error);

    });
}

function resetData() {
    if (!isAdmin) return;

    if (confirm("আপনি কি নিশ্চিত যে সকল ডাটা রিসেট করতে চান?")) {

        // Default state এ ফিরে যাওয়া
        state = JSON.parse(JSON.stringify(defaultState));

        // Local browser থেকেও update
        localStorage.setItem(
            'bachelor_brotherhood_db',
            JSON.stringify(state)
        );

        // Firebase এ reset data পাঠানো
        if (firebaseReady) {

            firebaseDataRef.set(state)
                .then(() => {

                    // Month dropdown update
                    const monthDropdown =
                        document.getElementById('selected-month');

                    if (monthDropdown) {
                        monthDropdown.value = state.selectedMonth;
                    }

                    // Website refresh/render
                    renderAll();

                    alert('ডাটা রিসেট সম্পন্ন হয়েছে এবং Firebase-এ sync হয়েছে।');

                    console.log("✅ Firebase data reset successfully");

                })
                .catch((error) => {

                    console.error(
                        "❌ Firebase reset error:",
                        error
                    );

                    alert(
                        "Firebase-এ reset করতে সমস্যা হয়েছে। Internet connection check করুন।"
                    );
                });

        } else {

            // Firebase ready না থাকলে local reset
            const monthDropdown =
                document.getElementById('selected-month');

            if (monthDropdown) {
                monthDropdown.value = state.selectedMonth;
            }

            renderAll();

            alert(
                'Local data reset হয়েছে, কিন্তু Firebase এখনো ready হয়নি।'
            );
        }
    }
}




// ==========================================
// MOBILE MENU TOGGLE HANDLERS
// ==========================================

// ১. মোবাইল মেনু ড্রপডাউন টগল করা
function toggleMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    const icon = document.getElementById('mobile-menu-icon');

    if (menu) {
        menu.classList.toggle('hidden');
        if (icon) {
            if (menu.classList.contains('hidden')) {
                icon.className = "fa-solid fa-bars text-lg";
            } else {
                icon.className = "fa-solid fa-xmark text-lg text-rose-400";
            }
        }
    }
}
