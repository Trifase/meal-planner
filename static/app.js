// State
let recipes = [];
let plan = { weeks: [] };
let shoppingList = {};
let mealPrep = { week1_prep: [], week2_prep: [] };
let activeWeekView = 'w1'; // Default: Settimana 1
let activeShoppingWeek = '1'; // Default: Settimana 1 (Spesa della Domenica)
let currentSlotContext = null; // { week_number, day_index, slot_name, current_recipe_id }
let currentViewRecipe = null;
let currentViewServings = 2;

const SLOT_LABELS = {
  colazione: { label: "Colazione", icon: "☕" },
  merenda_mattina: { label: "Spuntino Matt.", icon: "🥜" },
  pranzo: { label: "Pranzo", icon: "🍝" },
  merenda_pomeriggio: { label: "Spuntino Pom.", icon: "🍎" },
  cena: { label: "Cena", icon: "🍽️" }
};

const CATEGORY_ICONS = {
  "Ortofrutta": "🥬",
  "Macellaio sotto casa": "🥩",
  "Banco Frigo & Latticini": "🧀",
  "Banco Frigo & Latticini (Senza Lattosio)": "🧀",
  "Surgelati": "❄️",
  "Dispensa, Scatolame & Secco": "🥫",
  "Pizzeria / Forno": "🍕",
  "Altro": "📦"
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupEventListeners();
  await loadAllData();
});

// Load all API data
async function loadAllData() {
  try {
    const [recRes, planRes] = await Promise.all([
      fetch('/api/recipes'),
      fetch('/api/plan')
    ]);
    recipes = await recRes.json();
    plan = await planRes.json();
    renderCalendar();
    renderRecipes();
  } catch (err) {
    console.error("Errore caricamento dati:", err);
  }
}

// Navigation Tabs
function setupNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.getElementById(`tab-${target}`).classList.add('active');

      if (target === 'shopping') {
        await loadShoppingList(activeShoppingWeek);
      } else if (target === 'mealprep') {
        await loadMealPrep();
      }
    });
  });
}

function setupEventListeners() {
  // Calendar Week View buttons
  document.getElementById('btn-view-w1').addEventListener('click', (e) => setWeekView('w1', e.target));
  document.getElementById('btn-view-w2').addEventListener('click', (e) => setWeekView('w2', e.target));
  document.getElementById('btn-view-both').addEventListener('click', (e) => setWeekView('both', e.target));

  // Copy Week 1 to Week 2
  document.getElementById('btn-copy-w1-to-w2').addEventListener('click', async () => {
    if (confirm("Vuoi duplicare tutti i pasti della Settimana 1 sulla Settimana 2?")) {
      const res = await fetch('/api/plan/copy-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_week: 1, target_week: 2 })
      });
      if (res.ok) {
        await loadAllData();
        alert("Settimana 1 copiata con successo su Settimana 2!");
      }
    }
  });

  // Shopping Week Selector buttons
  document.getElementById('btn-shop-w1').addEventListener('click', (e) => setShoppingWeek('1', e.target));
  document.getElementById('btn-shop-w2').addEventListener('click', (e) => setShoppingWeek('2', e.target));
  document.getElementById('btn-shop-both').addEventListener('click', (e) => setShoppingWeek('both', e.target));

  // Shopping List buttons
  document.getElementById('btn-copy-shopping-whatsapp').addEventListener('click', copyShoppingToWhatsApp);
  document.getElementById('btn-refresh-shopping').addEventListener('click', () => loadShoppingList(activeShoppingWeek));

  // Recipe search & filter
  document.getElementById('recipe-search').addEventListener('input', renderRecipes);
  document.querySelectorAll('.category-pills .pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      document.querySelectorAll('.category-pills .pill').forEach(p => p.classList.remove('active'));
      e.target.classList.add('active');
      renderRecipes();
    });
  });

  // Recipe View Modal (Porzioni Scalabili)
  document.getElementById('btn-close-view-recipe-modal').addEventListener('click', closeRecipeViewModal);
  document.getElementById('btn-close-view-bottom').addEventListener('click', closeRecipeViewModal);
  document.getElementById('btn-scale-minus').addEventListener('click', () => changeViewServings(-1));
  document.getElementById('btn-scale-plus').addEventListener('click', () => changeViewServings(1));
  document.getElementById('btn-open-edit-from-view').addEventListener('click', () => {
    const r = currentViewRecipe;
    closeRecipeViewModal();
    if (r) openRecipeModal(r);
  });

  // Recipe Create / Edit Modal
  document.getElementById('btn-open-new-recipe-modal').addEventListener('click', () => openRecipeModal());
  document.getElementById('btn-close-recipe-modal').addEventListener('click', closeRecipeModal);
  document.getElementById('btn-cancel-recipe').addEventListener('click', closeRecipeModal);
  document.getElementById('btn-add-ingredient-row').addEventListener('click', () => addIngredientRow());
  document.getElementById('recipe-is-mealprep').addEventListener('change', (e) => {
    document.getElementById('mealprep-details-fields').classList.toggle('hidden', !e.target.checked);
  });
  document.getElementById('form-recipe').addEventListener('submit', handleSaveRecipe);

  // Slot Modal
  document.getElementById('btn-close-slot-modal').addEventListener('click', closeSlotModal);
  document.getElementById('btn-clear-slot').addEventListener('click', clearCurrentSlot);
  document.getElementById('slot-modal-search').addEventListener('input', renderSlotRecipeOptions);
}

function setWeekView(view, targetBtn) {
  activeWeekView = view;
  document.querySelectorAll('.week-filter-group .btn').forEach(b => b.classList.remove('active'));
  targetBtn.classList.add('active');
  renderCalendar();
}

function setShoppingWeek(week, targetBtn) {
  activeShoppingWeek = week;
  document.querySelectorAll('.shopping-week-selector .btn').forEach(b => b.classList.remove('active'));
  targetBtn.classList.add('active');
  loadShoppingList(activeShoppingWeek);
}

// CALENDAR RENDERING (PULITO, COMPATTO, SENZA COMMENTI)
function renderCalendar() {
  const container = document.getElementById('calendar-grid');
  container.innerHTML = '';

  const recipeMap = new Map(recipes.map(r => [r.id, r]));

  plan.weeks.forEach(week => {
    if (activeWeekView === 'w1' && week.week_number !== 1) return;
    if (activeWeekView === 'w2' && week.week_number !== 2) return;

    const weekBlock = document.createElement('div');
    weekBlock.className = 'week-block';

    weekBlock.innerHTML = `
      <div class="week-title-bar">
        <h3>🗓️ ${week.title}</h3>
        <span class="badge badge-prep">${week.days.length} Giorni</span>
      </div>
      <div class="days-row">
        ${week.days.map(day => renderDayCard(week.week_number, day, recipeMap)).join('')}
      </div>
    `;

    container.appendChild(weekBlock);
  });

  // Attach slot click events (cambio ricetta nello slot)
  document.querySelectorAll('.slot-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.btn-view-recipe-slot')) return;

      const weekNum = parseInt(el.dataset.week);
      const dayIdx = parseInt(el.dataset.day);
      const slotName = el.dataset.slot;
      const currentRecipeId = el.dataset.recipeId;
      openSlotModal(weekNum, dayIdx, slotName, currentRecipeId);
    });
  });

  // Attach view recipe click events (pulsante 📖 per aprire la ricetta con porzioni scalabili)
  document.querySelectorAll('.btn-view-recipe-slot').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const recipeId = btn.dataset.recipeId;
      const r = recipes.find(x => x.id === recipeId);
      if (r) {
        openRecipeViewModal(r);
      }
    });
  });
}

function renderDayCard(weekNum, day, recipeMap) {
  const slotKeys = ['colazione', 'merenda_mattina', 'pranzo', 'merenda_pomeriggio', 'cena'];

  const slotsHtml = slotKeys.map(key => {
    const rId = day.slots ? day.slots[key] : null;
    const r = rId ? recipeMap.get(rId) : null;
    const info = SLOT_LABELS[key];

    let contentHtml = `<span class="slot-empty">+ Aggiungi</span>`;
    let badgesHtml = '';
    let viewIconHtml = '';

    if (r) {
      contentHtml = `<div class="slot-recipe-title" title="${r.title}">${r.title}</div>`;
      badgesHtml = `
        <div class="slot-badges">
          <span class="badge badge-time">${r.prep_time_minutes}m</span>
          ${r.meal_prep && r.meal_prep.is_prep ? `<span class="badge badge-prep">Prep</span>` : ''}
        </div>
      `;
      viewIconHtml = `
        <button type="button" class="btn-view-recipe-slot" data-recipe-id="${rId}" title="Apri ricetta con dosi scalabili">
          📖
        </button>
      `;
    }

    return `
      <div class="slot-item slot-${key}" data-week="${weekNum}" data-day="${day.day_index}" data-slot="${key}" data-recipe-id="${rId || ''}">
        <div class="slot-label">
          <span>${info.icon} ${info.label}</span>
          ${viewIconHtml}
        </div>
        <div class="slot-body">
          ${contentHtml}
        </div>
        ${badgesHtml ? badgesHtml : '<div class="slot-badges-empty"></div>'}
      </div>
    `;
  }).join('');

  return `
    <div class="day-card">
      <div class="day-header">
        <div class="day-name">${day.day_name}</div>
      </div>
      ${slotsHtml}
    </div>
  `;
}

// RECIPE VIEW MODAL WITH DYNAMIC SERVINGS SCALER
function openRecipeViewModal(recipe) {
  currentViewRecipe = recipe;
  currentViewServings = recipe.servings || 2;

  document.getElementById('view-recipe-title').textContent = recipe.title;

  // Badges
  const badgesContainer = document.getElementById('view-recipe-badges');
  badgesContainer.innerHTML = `
    <span class="badge badge-time">⏱️ ${recipe.prep_time_minutes} min</span>
    <span class="badge badge-time">🍽️ ${recipe.category.toUpperCase()}</span>
    ${recipe.meal_prep && recipe.meal_prep.is_prep ? `<span class="badge badge-prep">🍳 Meal Prep</span>` : ''}
    ${recipe.meal_prep && recipe.meal_prep.can_freeze ? `<span class="badge badge-prep">🧊 Congelabile</span>` : ''}
  `;

  document.getElementById('view-recipe-base-info').textContent = `Base ricetta: ${recipe.servings || 2} porzioni`;

  // Render scaled ingredients
  renderScaledIngredients();

  // Meal prep section
  const prepBox = document.getElementById('view-recipe-mealprep-box');
  const prepText = document.getElementById('view-recipe-mealprep-text');
  if (recipe.meal_prep && recipe.meal_prep.is_prep) {
    prepBox.classList.remove('hidden');
    prepBox.style.display = 'block';
    prepText.innerHTML = `<strong>${recipe.meal_prep.batch_title || 'Preparazione'}:</strong> ${recipe.meal_prep.instructions}`;
  } else {
    prepBox.classList.add('hidden');
    prepBox.style.display = 'none';
    prepText.innerHTML = '';
  }

  // Notes section
  const notesBox = document.getElementById('view-recipe-notes-box');
  const notesText = document.getElementById('view-recipe-notes-text');
  if (recipe.notes && recipe.notes.trim()) {
    notesBox.classList.remove('hidden');
    notesBox.style.display = 'block';
    notesText.textContent = recipe.notes;
  } else {
    notesBox.classList.add('hidden');
    notesBox.style.display = 'none';
    notesText.textContent = '';
  }

  document.getElementById('modal-view-recipe').classList.remove('hidden');
}

function closeRecipeViewModal() {
  document.getElementById('modal-view-recipe').classList.add('hidden');
  document.getElementById('view-recipe-mealprep-text').innerHTML = '';
  document.getElementById('view-recipe-notes-text').textContent = '';
  currentViewRecipe = null;
}

function changeViewServings(delta) {
  if (!currentViewRecipe) return;
  const newServings = currentViewServings + delta;
  if (newServings < 1 || newServings > 20) return;
  currentViewServings = newServings;
  renderScaledIngredients();
}

function renderScaledIngredients() {
  if (!currentViewRecipe) return;

  const countEl = document.getElementById('view-recipe-servings-count');
  countEl.textContent = `${currentViewServings} ${currentViewServings === 1 ? 'persona' : 'persone'}`;

  const list = document.getElementById('view-recipe-ingredients-list');
  list.innerHTML = '';

  const baseServings = currentViewRecipe.servings || 2;
  const multiplier = currentViewServings / baseServings;

  if (!currentViewRecipe.ingredients || currentViewRecipe.ingredients.length === 0) {
    list.innerHTML = `<li style="padding: 8px; color: #94a3b8; font-style: italic;">Nessun ingrediente specifico richiesto (es. pasto fuori casa).</li>`;
    return;
  }

  currentViewRecipe.ingredients.forEach(ing => {
    const rawScaled = ing.quantity * multiplier;
    const formattedQty = (rawScaled % 1 !== 0) ? rawScaled.toFixed(1) : Math.round(rawScaled);

    const li = document.createElement('li');
    li.className = 'view-ingredient-item';
    li.innerHTML = `
      <span><strong>${ing.name}</strong> <span style="font-size: 11px; color: #64748b;">(${ing.category})</span></span>
      <span class="ing-qty-tag">${formattedQty} ${ing.unit}</span>
    `;
    list.appendChild(li);
  });
}

// SLOT MODAL
function openSlotModal(weekNum, dayIdx, slotName, currentRecipeId) {
  currentSlotContext = { weekNum, dayIdx, slotName, currentRecipeId };
  const modal = document.getElementById('modal-select-recipe');
  const info = SLOT_LABELS[slotName];

  let dayName = "Giorno";
  const w = plan.weeks.find(x => x.week_number === weekNum);
  if (w) {
    const d = w.days.find(x => x.day_index === dayIdx);
    if (d) dayName = d.day_name;
  }

  document.getElementById('modal-slot-title').textContent = `${info.icon} ${info.label} (${dayName} - W${weekNum})`;
  document.getElementById('slot-modal-search').value = '';
  renderSlotRecipeOptions();
  modal.classList.remove('hidden');
}

function closeSlotModal() {
  document.getElementById('modal-select-recipe').classList.add('hidden');
  currentSlotContext = null;
}

function renderSlotRecipeOptions() {
  const query = document.getElementById('slot-modal-search').value.toLowerCase();
  const list = document.getElementById('slot-recipes-list');
  list.innerHTML = '';

  const { slotName, currentRecipeId } = currentSlotContext;

  const filtered = recipes.filter(r => {
    const slotMatches = (r.allowed_slots && r.allowed_slots.includes(slotName)) || r.category === slotName;
    const searchMatches = !query || r.title.toLowerCase().includes(query) || (r.notes && r.notes.toLowerCase().includes(query));
    return slotMatches && searchMatches;
  });

  if (filtered.length === 0) {
    list.innerHTML = `<p style="padding: 10px; color: #94a3b8; text-align: center; font-size: 12px;">Nessuna ricetta per questo slot. Cerca dal ricettario.</p>`;
    return;
  }

  filtered.forEach(r => {
    const el = document.createElement('div');
    el.className = `slot-recipe-option ${r.id === currentRecipeId ? 'selected' : ''}`;
    el.innerHTML = `
      <div>
        <div style="font-weight: 600;">${r.title}</div>
        <div style="font-size: 11px; color: #64748b;">⏱️ ${r.prep_time_minutes} min • ${r.ingredients.length} ingr. • ${r.servings || 2} pers.</div>
      </div>
      ${r.meal_prep && r.meal_prep.is_prep ? `<span class="badge badge-prep">Meal Prep</span>` : ''}
    `;
    el.addEventListener('click', () => selectRecipeForSlot(r.id));
    list.appendChild(el);
  });
}

async function selectRecipeForSlot(recipeId) {
  if (!currentSlotContext) return;
  const { weekNum, dayIdx, slotName } = currentSlotContext;

  try {
    const res = await fetch('/api/plan/slot', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        week_number: weekNum,
        day_index: dayIdx,
        slot_name: slotName,
        recipe_id: recipeId
      })
    });
    if (res.ok) {
      const w = plan.weeks.find(x => x.week_number === weekNum);
      if (w) {
        const d = w.days.find(x => x.day_index === dayIdx);
        if (d) {
          if (!d.slots) d.slots = {};
          d.slots[slotName] = recipeId;
        }
      }
      closeSlotModal();
      renderCalendar();
    }
  } catch (err) {
    alert("Errore salvataggio slot");
  }
}

async function clearCurrentSlot() {
  if (!currentSlotContext) return;
  await selectRecipeForSlot(null);
}

// SHOPPING LIST
async function loadShoppingList(week = activeShoppingWeek) {
  try {
    const res = await fetch(`/api/shopping-list?week=${week}`);
    shoppingList = await res.json();
    renderShoppingList();
  } catch (err) {
    console.error("Errore lista spesa:", err);
  }
}

function renderShoppingList() {
  const container = document.getElementById('shopping-categories-container');
  container.innerHTML = '';

  const checkedState = JSON.parse(localStorage.getItem('checked_shopping_items') || '{}');

  const categories = Object.keys(shoppingList);
  if (categories.length === 0) {
    container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 30px;">Nessun pasto pianificato nella settimana selezionata. Riempi gli slot nel calendario per generare la spesa.</p>`;
    return;
  }

  categories.forEach(cat => {
    const items = shoppingList[cat];
    const icon = CATEGORY_ICONS[cat] || "📦";

    const card = document.createElement('div');
    card.className = 'category-card';

    const itemsHtml = items.map((item) => {
      const itemKey = `${activeShoppingWeek}__${cat}__${item.name}`;
      const isChecked = checkedState[itemKey] || false;

      // Link cliccabili per ciascuna ricetta (aprono la Recipe View Modal)
      const recipeLinks = item.recipes.map(recipeTitle => {
        const rObj = recipes.find(r => r.title === recipeTitle);
        const rId = rObj ? rObj.id : '';
        return `<span class="recipe-link-badge" data-recipe-id="${rId}" title="Clicca per aprire la ricetta con dosi">${recipeTitle}</span>`;
      }).join(', ');

      return `
        <li class="shopping-item-row ${isChecked ? 'checked' : ''}" data-key="${itemKey}">
          <input type="checkbox" ${isChecked ? 'checked' : ''} class="shopping-checkbox">
          <div class="shopping-item-name">
            ${item.name}
            <div class="shopping-item-usages">Usato in: ${recipeLinks} (${item.occurrences}x)</div>
          </div>
          <div class="shopping-item-qty">${item.quantity} ${item.unit}</div>
        </li>
      `;
    }).join('');

    card.innerHTML = `
      <div class="category-card-header">
        <span>${icon} ${cat}</span>
        <span class="badge badge-time">${items.length} articoli</span>
      </div>
      <ul class="category-items-list">
        ${itemsHtml}
      </ul>
    `;

    container.appendChild(card);
  });

  // Checkbox interactions
  document.querySelectorAll('.shopping-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const row = e.target.closest('.shopping-item-row');
      const key = row.dataset.key;
      const checked = e.target.checked;
      row.classList.toggle('checked', checked);

      const state = JSON.parse(localStorage.getItem('checked_shopping_items') || '{}');
      state[key] = checked;
      localStorage.setItem('checked_shopping_items', JSON.stringify(state));
    });
  });

  // Recipe link badges click -> open recipe view modal
  document.querySelectorAll('.recipe-link-badge').forEach(badge => {
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const rId = badge.dataset.recipeId;
      const r = recipes.find(x => x.id === rId);
      if (r) {
        openRecipeViewModal(r);
      }
    });
  });
}

function copyShoppingToWhatsApp() {
  const weekLabel = activeShoppingWeek === 'both' ? 'PER 2 SETTIMANE' : `SETTIMANALE (Settimana ${activeShoppingWeek})`;
  let text = `🛒 *LISTA DELLA SPESA ${weekLabel} (Pianificazione Famiglia)*\n`;
  text += `_Spesa domenicale calcolata dal nostro piano pasti_\n\n`;

  for (const [cat, items] of Object.entries(shoppingList)) {
    const icon = CATEGORY_ICONS[cat] || "📦";
    text += `*${icon} ${cat.toUpperCase()}*\n`;
    items.forEach(item => {
      text += `• ${item.name}: *${item.quantity} ${item.unit}*\n`;
    });
    text += "\n";
  }

  text += "🥑 _Piano Pasti & Nutrizione Sana • Fatto Insieme!_";

  navigator.clipboard.writeText(text).then(() => {
    alert("✅ Lista della spesa copiata negli appunti! Ora puoi incollarla su WhatsApp.");
  }).catch(() => {
    prompt("Copia manualmente il testo per WhatsApp:", text);
  });
}

// RECIPES TAB
function renderRecipes() {
  const container = document.getElementById('recipes-grid');
  container.innerHTML = '';

  const query = document.getElementById('recipe-search').value.toLowerCase();
  const activePill = document.querySelector('.category-pills .pill.active').dataset.cat;

  const filtered = recipes.filter(r => {
    const matchesSearch = !query || r.title.toLowerCase().includes(query) ||
      r.ingredients.some(i => i.name.toLowerCase().includes(query));

    let matchesCat = true;
    if (activePill === 'meal_prep') {
      matchesCat = r.meal_prep && r.meal_prep.is_prep;
    } else if (activePill !== 'all') {
      matchesCat = r.category === activePill;
    }

    return matchesSearch && matchesCat;
  });

  filtered.forEach(r => {
    const card = document.createElement('div');
    card.className = 'recipe-card';

    const ingredientsHtml = r.ingredients.map(i =>
      `<li><strong>${i.name}:</strong> ${i.quantity} ${i.unit}</li>`
    ).join('');

    card.innerHTML = `
      <div class="recipe-card-content" data-id="${r.id}" style="cursor: pointer;">
        <div class="recipe-card-header">
          <div class="recipe-card-title">${r.title}</div>
        </div>
        <div class="recipe-card-badges">
          <span class="badge badge-time">⏱️ ${r.prep_time_minutes} min</span>
          <span class="badge badge-time">👥 ${r.servings || 2} Persone (Scalabile)</span>
          ${r.meal_prep && r.meal_prep.is_prep ? `<span class="badge badge-prep">🍳 Meal Prep</span>` : ''}
          ${r.meal_prep && r.meal_prep.can_freeze ? `<span class="badge badge-prep">🧊 Congelabile</span>` : ''}
        </div>

        <div class="recipe-ingredients-preview">
          <strong>Ingredienti (base ${r.servings || 2} porzioni):</strong>
          <ul>${ingredientsHtml}</ul>
        </div>

        ${r.meal_prep && r.meal_prep.is_prep ? `
          <div class="recipe-prep-info">
            <strong>🍳 Meal Prep (${r.meal_prep.prep_day}):</strong> ${r.meal_prep.instructions}
          </div>
        ` : ''}

        ${r.notes ? `<div class="recipe-notes">💡 ${r.notes}</div>` : ''}
      </div>

      <div class="recipe-actions">
        <button class="btn btn-sm btn-primary btn-view-recipe" data-id="${r.id}">🔍 Dosi & Porzioni</button>
        <button class="btn btn-sm btn-outline btn-edit-recipe" data-id="${r.id}">✏️ Modifica</button>
        <button class="btn btn-sm btn-outline text-danger btn-delete-recipe" data-id="${r.id}">🗑️ Elimina</button>
      </div>
    `;

    container.appendChild(card);
  });

  // Click on card body or "Dosi & Porzioni" button -> opens Recipe View Modal
  document.querySelectorAll('.recipe-card-content, .btn-view-recipe').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = el.dataset.id;
      const r = recipes.find(x => x.id === id);
      if (r) openRecipeViewModal(r);
    });
  });

  document.querySelectorAll('.btn-edit-recipe').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = b.dataset.id;
      const r = recipes.find(x => x.id === id);
      if (r) openRecipeModal(r);
    });
  });

  document.querySelectorAll('.btn-delete-recipe').forEach(b => {
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = b.dataset.id;
      if (confirm("Vuoi davvero eliminare questa ricetta?")) {
        await fetch(`/api/recipes/${id}`, { method: 'DELETE' });
        await loadAllData();
      }
    });
  });
}

// RECIPE MODAL (CREATE / EDIT)
function openRecipeModal(recipe = null) {
  const modal = document.getElementById('modal-edit-recipe');
  const titleEl = document.getElementById('recipe-modal-title');
  const ingredientsList = document.getElementById('ingredients-form-list');
  ingredientsList.innerHTML = '';

  if (recipe) {
    titleEl.textContent = "Modifica Ricetta";
    document.getElementById('edit-recipe-id').value = recipe.id;
    document.getElementById('recipe-title').value = recipe.title;
    document.getElementById('recipe-category').value = recipe.category;
    document.getElementById('recipe-servings').value = recipe.servings || 2;
    document.getElementById('recipe-prep-time').value = recipe.prep_time_minutes;
    document.getElementById('recipe-notes').value = recipe.notes || '';

    // Allowed slots
    document.querySelectorAll('input[name="allowed_slots"]').forEach(cb => {
      cb.checked = recipe.allowed_slots && recipe.allowed_slots.includes(cb.value);
    });

    // Meal prep
    const isPrep = recipe.meal_prep && recipe.meal_prep.is_prep;
    document.getElementById('recipe-is-mealprep').checked = isPrep;
    document.getElementById('mealprep-details-fields').classList.toggle('hidden', !isPrep);
    if (isPrep) {
      document.getElementById('prep-batch-title').value = recipe.meal_prep.batch_title || '';
      document.getElementById('prep-instructions').value = recipe.meal_prep.instructions || '';
      document.getElementById('prep-can-freeze').checked = recipe.meal_prep.can_freeze !== false;
    }

    // Ingredients
    recipe.ingredients.forEach(ing => addIngredientRow(ing));
  } else {
    titleEl.textContent = "Nuova Ricetta";
    document.getElementById('edit-recipe-id').value = '';
    document.getElementById('recipe-title').value = '';
    document.getElementById('recipe-category').value = 'pranzo';
    document.getElementById('recipe-servings').value = '2';
    document.getElementById('recipe-prep-time').value = '8';
    document.getElementById('recipe-notes').value = '';

    document.querySelectorAll('input[name="allowed_slots"]').forEach(cb => {
      cb.checked = cb.value === 'pranzo' || cb.value === 'cena';
    });

    document.getElementById('recipe-is-mealprep').checked = false;
    document.getElementById('mealprep-details-fields').classList.add('hidden');
    document.getElementById('prep-batch-title').value = '';
    document.getElementById('prep-instructions').value = '';

    // Add 2 empty ingredient rows
    addIngredientRow();
    addIngredientRow();
  }

  modal.classList.remove('hidden');
}

function closeRecipeModal() {
  document.getElementById('modal-edit-recipe').classList.add('hidden');
}

function addIngredientRow(data = null) {
  const list = document.getElementById('ingredients-form-list');
  const row = document.createElement('div');
  row.className = 'ingredient-row';

  const categories = [
    "Ortofrutta",
    "Macellaio sotto casa",
    "Banco Frigo & Latticini",
    "Surgelati",
    "Dispensa, Scatolame & Secco",
    "Pizzeria / Forno",
    "Altro"
  ];

  let currentCat = data ? data.category : "Ortofrutta";
  if (currentCat.includes("Senza Lattosio")) {
    currentCat = "Banco Frigo & Latticini";
  }

  const catOptions = categories.map(c =>
    `<option value="${c}" ${currentCat === c ? 'selected' : ''}>${c}</option>`
  ).join('');

  row.innerHTML = `
    <input type="text" placeholder="Ingrediente" class="form-input ing-name" value="${data ? data.name : ''}" required>
    <input type="number" step="any" placeholder="Qtà" class="form-input ing-qty" value="${data ? data.quantity : ''}" required>
    <input type="text" placeholder="Unità" class="form-input ing-unit" value="${data ? data.unit : 'g'}" required>
    <select class="form-input ing-cat">${catOptions}</select>
    <button type="button" class="btn btn-sm btn-outline text-danger btn-remove-ing">&times;</button>
  `;

  row.querySelector('.btn-remove-ing').addEventListener('click', () => row.remove());
  list.appendChild(row);
}

async function handleSaveRecipe(e) {
  e.preventDefault();

  const id = document.getElementById('edit-recipe-id').value;
  const title = document.getElementById('recipe-title').value;
  const category = document.getElementById('recipe-category').value;
  const servings = parseInt(document.getElementById('recipe-servings').value) || 2;
  const prepTime = parseInt(document.getElementById('recipe-prep-time').value) || 5;
  const notes = document.getElementById('recipe-notes').value;

  const allowedSlots = Array.from(document.querySelectorAll('input[name="allowed_slots"]:checked')).map(cb => cb.value);

  // Ingredients
  const rows = document.querySelectorAll('.ingredient-row');
  const ingredients = [];
  rows.forEach(r => {
    const name = r.querySelector('.ing-name').value.trim();
    const qty = parseFloat(r.querySelector('.ing-qty').value) || 1;
    const unit = r.querySelector('.ing-unit').value.trim();
    let cat = r.querySelector('.ing-cat').value;
    if (cat.includes("Senza Lattosio")) {
      cat = "Banco Frigo & Latticini";
    }
    if (name) {
      ingredients.push({ name, quantity: qty, unit, category: cat });
    }
  });

  if (ingredients.length === 0) {
    alert("Inserisci almeno un ingrediente!");
    return;
  }

  // Meal prep
  const isPrep = document.getElementById('recipe-is-mealprep').checked;
  let mealPrepInfo = null;
  if (isPrep) {
    mealPrepInfo = {
      is_prep: true,
      prep_day: "Domenica",
      batch_title: document.getElementById('prep-batch-title').value || title,
      instructions: document.getElementById('prep-instructions').value || "",
      can_freeze: document.getElementById('prep-can-freeze').checked
    };
  }

  const recipePayload = {
    title,
    category,
    allowed_slots: allowedSlots,
    servings,
    prep_time_minutes: prepTime,
    ingredients,
    meal_prep: mealPrepInfo,
    notes
  };

  try {
    let res;
    if (id) {
      res = await fetch(`/api/recipes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipePayload)
      });
    } else {
      res = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipePayload)
      });
    }

    if (res.ok) {
      closeRecipeModal();
      await loadAllData();
    } else {
      alert("Errore salvataggio ricetta");
    }
  } catch (err) {
    alert("Errore di rete");
  }
}

// MEAL PREP TAB
async function loadMealPrep() {
  try {
    const res = await fetch('/api/meal-prep');
    mealPrep = await res.json();
    renderMealPrep();
  } catch (err) {
    console.error("Errore meal prep:", err);
  }
}

function renderMealPrep() {
  const w1List = document.getElementById('mealprep-w1-list');
  const w2List = document.getElementById('mealprep-w2-list');

  w1List.innerHTML = renderPrepTasks(mealPrep.week1_prep, 'w1');
  w2List.innerHTML = renderPrepTasks(mealPrep.week2_prep, 'w2');

  // Checkbox listener
  document.querySelectorAll('.prep-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const card = e.target.closest('.prep-item-card');
      const key = card.dataset.key;
      const checked = e.target.checked;
      card.style.opacity = checked ? '0.5' : '1';

      const state = JSON.parse(localStorage.getItem('checked_prep_items') || '{}');
      state[key] = checked;
      localStorage.setItem('checked_prep_items', JSON.stringify(state));
    });
  });
}

function renderPrepTasks(tasks, weekKey) {
  if (!tasks || tasks.length === 0) {
    return `<p style="color: #94a3b8; font-style: italic; padding: 8px; font-size: 11.5px;">Nessuna preparazione richiesta per questa settimana.</p>`;
  }

  const prepState = JSON.parse(localStorage.getItem('checked_prep_items') || '{}');

  return tasks.map((t) => {
    const key = `${weekKey}__${t.batch_title}`;
    const isChecked = prepState[key] || false;

    return `
      <div class="prep-item-card" data-key="${key}" style="${isChecked ? 'opacity: 0.5;' : ''}">
        <div class="prep-item-title">
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="checkbox" class="prep-checkbox" ${isChecked ? 'checked' : ''}>
            <span>${t.batch_title}</span>
          </label>
          ${t.can_freeze ? `<span class="badge badge-prep">🧊 Freezer OK</span>` : ''}
        </div>
        <div class="prep-item-desc">${t.instructions}</div>
        <div class="prep-item-needed">Necessario per: <strong>${t.needed_for.join(', ')}</strong></div>
      </div>
    `;
  }).join('');
}
