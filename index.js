// ⚠️ 記得把下面的網址換成你專屬的 Google Apps Script 部署網址
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwoHtAUTSVOkAmMkVp1MpWq7_oJGJP8mDxjU5uHi6sZ-8AlHmydABJ1qoGC0PzyhJ9P/exec";

let dishDatabase = [];
let menuSchedule = {};
let currentFilter = '全部';
let selectedDateKey = null;

// 在網頁頂部動態插入一個雲端同步狀態條
function updateSyncStatus(status, text) {
    let bar = document.getElementById('syncStatusBar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'syncStatusBar';
        bar.style = "position: fixed; top: 0; left: 0; width: 100%; text-align: center; font-size: 0.8rem; padding: 4px; z-index: 9999; font-weight: bold;";
        document.body.appendChild(bar);
    }
    if (status === 'loading') {
        bar.style.backgroundColor = '#feebc8'; bar.style.color = '#dd6b20'; bar.innerText = text || '⏳ 雲端資料同步中...';
    } else if (status === 'success') {
        bar.style.backgroundColor = '#c6f6d5'; bar.style.color = '#22543d'; bar.innerText = text || '✅ 雲端同步成功';
        setTimeout(() => bar.style.display = 'none', 2000);
    } else if (status === 'error') {
        bar.style.backgroundColor = '#fed7d7'; bar.style.color = '#9b2c2c'; bar.innerText = text || '❌ 同步失敗，請檢查網路';
    }
    bar.style.display = 'block';
}

// 遠端讀取試算表資料
async function loadCloudData() {
    updateSyncStatus('loading', '⏳ 正在自 Google 試算表下載備料排程...');
    try {
        const response = await fetch(`${GAS_API_URL}?action=getData`);
        const data = await response.json();
        
        dishDatabase = data.dishes || [];
        menuSchedule = data.schedule || {};
        
        // 如果雲端完全沒資料，載入初始預設值
        if (dishDatabase.length === 0) {
            dishDatabase = [
                { id: 1, name: "肉絲炒飯", tags: ["中餐", "晚餐"], ingredients: ["白飯300g", "豬肉絲120g", "雞蛋2顆", "蔥20g"], method: "大火熱油炒香肉絲，下蛋液與白飯快速翻炒。" },
                { id: 2, name: "火腿蛋餅", tags: ["早餐", "宵夜"], ingredients: ["蛋餅皮1張", "雞蛋1顆", "火腿片1片"], method: "中火將餅皮煎至兩面微黃，倒入蛋液蓋上餅皮。" }
            ];
            await saveCloudData(); // 順便幫雲端初始化
        }

        renderDishList();
        renderCalendar();
        selectedDateKey = "7/3"; // 預設今天
        updateIngredientsSummary(selectedDateKey);
        updateSyncStatus('success', '✅ 雲端資料載入完成！');
    } catch (error) {
        console.error(error);
        updateSyncStatus('error', '❌ 無法連線至雲端資料庫，請檢查 API 網址。');
    }
}

// 遠端存入試算表資料
async function saveCloudData() {
    updateSyncStatus('loading', '💾 正在同步更新至 Google 雲端...');
    try {
        const response = await fetch(GAS_API_URL, {
            method: 'POST',
            mode: 'no-cors', // 使用 no-cors 模式避免跨網域資安封鎖
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'saveAll',
                dishes: dishDatabase,
                schedule: menuSchedule
            })
        });
        
        // 註：no-cors 模式下無法讀取 response 內容，但若沒拋出 error 即代表發送成功
        updateSyncStatus('success', '✅ 備料排程已安全存入雲端！');
    } catch (error) {
        console.error(error);
        updateSyncStatus('error', '❌ 儲存至雲端失敗。');
    }
}

// 【核心邏輯】材料智慧解析與加總器
function parseAndAggregateIngredients(ingredientsArray) {
    let totals = {};
    ingredientsArray.forEach(str => {
        if (!str) return;
        const match = str.match(/^([^\d\s\.]+)([\d\.]+)?(.*)$/);
        if (match) {
            const name = match[1].trim();
            const value = match[2] ? parseFloat(match[2]) : null;
            const unit = match[3] ? match[3].trim() : '';

            if (value !== null) {
                if (!totals[name]) totals[name] = { value: 0, unit: unit };
                totals[name].value += value;
                if(unit) totals[name].unit = unit; 
            } else {
                if (!totals[name]) totals[name] = { value: null, unit: unit };
            }
        }
    });

    let resultStrings = [];
    for (let name in totals) {
        if (totals[name].value !== null) {
            const roundedValue = Math.round(totals[name].value * 100) / 100;
            resultStrings.push(`${name} : ${roundedValue} ${totals[name].unit}`);
        } else {
            resultStrings.push(`${name}`);
        }
    }
    return resultStrings;
}

function updateIngredientsSummary(dateKey) {
    const panel = document.getElementById('summaryPanel');
    const title = document.getElementById('summaryTitle');
    const listContainer = document.getElementById('ingredientsList');
    
    title.innerText = `📊 ${dateKey} 備料清單與食材量化加總`;
    listContainer.innerHTML = '';

    const dayMeals = menuSchedule[dateKey];
    let allIngredients = [];
    let hasFood = false;

    if (dayMeals) {
        ['早餐', '中餐', '晚餐', '宵夜', '點心'].forEach(mealType => {
            if (dayMeals[mealType] && dayMeals[mealType].length > 0) {
                hasFood = true;
                dayMeals[mealType].forEach(dishId => {
                    const dish = dishDatabase.find(d => d.id === dishId);
                    if (dish && dish.ingredients) {
                        allIngredients = allIngredients.concat(dish.ingredients);
                    }
                });
            }
        });
    }

    if (!hasFood) {
        listContainer.innerHTML = '<li>今天此日無排餐，無需備料！</li>';
        panel.style.display = 'block';
        return;
    }

    let aggregatedIngredients = parseAndAggregateIngredients(allIngredients);

    if(aggregatedIngredients.length === 0) {
        listContainer.innerHTML = '<li>所選菜色未設定材料。</li>';
    } else {
        aggregatedIngredients.forEach(ing => {
            const li = document.createElement('li');
            li.className = 'ingredient-tag';
            li.innerText = ing;
            listContainer.appendChild(li);
        });
    }
    panel.style.display = 'block';
}

function renderDishList() {
    const container = document.getElementById('dishList');
    container.innerHTML = '';
    const filtered = dishDatabase.filter(d => currentFilter === '全部' || d.tags.includes(currentFilter));

    filtered.forEach(dish => {
        const item = document.createElement('div');
        item.className = 'dish-item';
        item.setAttribute('draggable', 'true');
        item.innerHTML = `
            <span onclick="showCookingMethod(${dish.id})">${dish.name}</span>
            <span class="edit-icon" onclick="editDish(${dish.id})">✏️</span>
        `;
        item.ondragstart = (e) => { e.dataTransfer.setData('text/plain', dish.id); };
        container.appendChild(item);
    });
}

function filterDishes(tag, button) {
    currentFilter = tag;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    button.classList.add('active');
    renderDishList();
}

function showCookingMethod(id) {
    const dish = dishDatabase.find(d => d.id === id);
    if (!dish) return;
    document.getElementById('methodPanel').style.display = 'block';
    document.getElementById('methodDishName').innerText = `🍳 ${dish.name} - 烹飪配方`;
    document.getElementById('methodContent').innerText = `【材料】\n${dish.ingredients.join('\n')}\n\n【做法】\n${dish.method || "暫無說明。"}`;
}

function editDish(id) {
    const dish = dishDatabase.find(d => d.id === id);
    if (!dish) return;

    document.getElementById('formTitle').innerText = "📝 編輯菜色內容";
    document.getElementById('editDishId').value = dish.id;
    document.getElementById('dishName').value = dish.name;
    document.getElementById('dishIngredients').value = dish.ingredients.join(', ');
    document.getElementById('dishMethod').value = dish.method;

    document.querySelectorAll('input[name="tags"]').forEach(cb => {
        cb.checked = dish.tags.includes(cb.value);
    });

    document.getElementById('btnSubmit').innerText = "更新菜色配方";
    document.getElementById('btnCancel').style.display = "block";
}

async function saveDish() {
    const idVal = document.getElementById('editDishId').value;
    const name = document.getElementById('dishName').value.trim();
    const ingredientsInput = document.getElementById('dishIngredients').value;
    const method = document.getElementById('dishMethod').value.trim();
    
    const checkboxes = document.querySelectorAll('input[name="tags"]:checked');
    let tags = [];
    checkboxes.forEach(cb => tags.push(cb.value));

    if (!name) { alert('請輸入菜色名稱！'); return; }
    const ingredients = ingredientsInput.split(',').map(i => i.trim()).filter(i => i !== "");

    if (idVal) {
        const dish = dishDatabase.find(d => d.id === parseInt(idVal));
        if (dish) {
            dish.name = name; dish.tags = tags; dish.ingredients = ingredients; dish.method = method;
        }
    } else {
        dishDatabase.push({ id: Date.now(), name, tags, ingredients, method });
    }

    clearForm();
    renderDishList();
    renderCalendar();
    if (selectedDateKey) updateIngredientsSummary(selectedDateKey);
    
    // 異步同步至雲端試算表
    await saveCloudData();
}

function clearForm() {
    document.getElementById('formTitle').innerText = "新增自訂菜色";
    document.getElementById('editDishId').value = "";
    document.getElementById('dishName').value = "";
    document.getElementById('dishIngredients').value = "";
    document.getElementById('dishMethod').value = "";
    document.querySelectorAll('input[name="tags"]').forEach(cb => cb.checked = false);
    document.getElementById('btnSubmit').innerText = "加入菜色庫";
    document.getElementById('btnCancel').style.display = "none";
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';
    
    const startDate = new Date(2026, 6, 3); // 7月3日
    const startDayOfWeek = startDate.getDay();
    const currentDayOfWeekIdx = startDayOfWeek === 0 ? 7 : startDayOfWeek;
    
    for (let i = 1; i < currentDayOfWeekIdx; i++) {
        const emptyCard = document.createElement('div');
        emptyCard.className = 'day-card empty';
        grid.appendChild(emptyCard);
    }

    const mealTypes = ['早餐', '中餐', '晚餐', '宵夜', '點心'];

    for (let i = 0; i < 15; i++) {
        const targetDate = new Date(startDate);
        targetDate.setDate(startDate.getDate() + i);
        const month = targetDate.getMonth() + 1;
        const date = targetDate.getDate();
        const dateKey = `${month}/${date}`;
        
        const isToday = i === 0 ? 'today' : '';
        const card = document.createElement('div');
        card.className = `day-card ${isToday}`;
        if(dateKey === selectedDateKey) card.classList.add('active-select');
        
        card.onclick = () => {
            selectedDateKey = dateKey;
            document.querySelectorAll('.day-card').forEach(c => c.classList.remove('active-select'));
            card.classList.add('active-select');
            updateIngredientsSummary(dateKey);
        };

        let todayBadge = i === 0 ? '<span class="badge">今天</span>' : '';
        card.innerHTML = `<div class="day-title"><span>${dateKey}</span>${todayBadge}</div>`;
        
        if (!menuSchedule[dateKey]) {
            menuSchedule[dateKey] = { 早餐: [], 中餐: [], 晚餐: [], 宵夜: [], 點心: [] };
        }

        mealTypes.forEach(mealType => {
            const slot = document.createElement('div');
            slot.className = 'meal-slot';
            slot.innerHTML = `<div class="meal-slot-title">${mealType}</div>`;
            
            slot.ondragover = (e) => { e.preventDefault(); slot.classList.add('drag-over'); };
            slot.ondragleave = () => slot.classList.remove('drag-over');
            slot.ondrop = async (e) => {
                e.preventDefault();
                slot.classList.remove('drag-over');
                const dishId = parseInt(e.dataTransfer.getData('text/plain'));
                
                if (!menuSchedule[dateKey][mealType].includes(dishId)) {
                    menuSchedule[dateKey][mealType].push(dishId);
                    renderCalendar();
                    if (dateKey === selectedDateKey) updateIngredientsSummary(dateKey);
                    await saveCloudData(); // 拖曳排餐後自動存雲端
                }
            };

            const dishIds = menuSchedule[dateKey][mealType] || [];
            dishIds.forEach(dishId => {
                const dish = dishDatabase.find(d => d.id === dishId);
                if (dish) {
                    const dishEl = document.createElement('div');
                    dishEl.className = 'placed-dish';
                    dishEl.innerHTML = `
                        <span onclick="event.stopPropagation(); showCookingMethod(${dish.id})">${dish.name}</span>
                        <span class="remove-btn" onclick="event.stopPropagation(); removeDishFromSchedule('${dateKey}', '${mealType}', ${dish.id})">×</span>
                    `;
                    slot.appendChild(dishEl);
                }
            });
            card.appendChild(slot);
        });
        grid.appendChild(card);
    }
}

async function removeDishFromSchedule(dateKey, mealType, dishId) {
    menuSchedule[dateKey][mealType] = menuSchedule[dateKey][mealType].filter(id => id !== dishId);
    renderCalendar();
    if (dateKey === selectedDateKey) updateIngredientsSummary(dateKey);
    await saveCloudData(); // 刪除排餐後自動存雲端
}

// 網頁開啟時，自動去 Google 試算表載入資料
window.onload = () => {
    loadCloudData();
};