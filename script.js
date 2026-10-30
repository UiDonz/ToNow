//State
const IMPORTANCE_RANK = { High: 0, Medium: 1, Low: 2 };
const IMPORTANCE_LEVELS = ["High", "Medium", "Low"];

// Each task: { id, title, importance, completed, groupSeq, doneSeq }
// groupSeq is refreshed whenever a task enters an active importance group
// (added, restored, or importance changed). doneSeq is refreshed when it is
// completed. Sorting by these numbers gives the required list order.
const tasks = [];
let nextId = 1;
let seqCounter = 0;
let editingId = null;

const state = {
    doingNowId: null,
    durationMin: 30,
    remainingSec: 30 * 60,
    endTime: null,
    intervalId: null,
    promptOpen: false,
};

function nextSeq() {
    seqCounter += 1;
    return seqCounter;
}

function findTask(id) {
    return tasks.find((task) => task.id === id);
}

function getDoingNowTask() {
    const task = findTask(state.doingNowId);
    return task && !task.completed ? task : null;
}

function getOrderedTasks() {
    const active = tasks
        .filter((task) => !task.completed)
        .sort((a, b) =>
            IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance] ||
            a.groupSeq - b.groupSeq);
    const completed = tasks
        .filter((task) => task.completed)
        .sort((a, b) => a.doneSeq - b.doneSeq);
    return active.concat(completed);
}

// ----- DOM references -----

const addForm = document.getElementById("add-form");
const newTitleInput = document.getElementById("new-title");
const newImportanceSelect = document.getElementById("new-importance");
const addError = document.getElementById("add-error");
const taskList = document.getElementById("task-list");
const emptyMsg = document.getElementById("empty-msg");
const doingNowTitle = document.getElementById("doing-now-title");
const durationSelect = document.getElementById("duration");
const timeDisplay = document.getElementById("time-display");
const startBtn = document.getElementById("start-btn");
const resetBtn = document.getElementById("reset-btn");
const clearBtn = document.getElementById("clear-btn");
const finishDialog = document.getElementById("finish-dialog");
const finishTaskTitle = document.getElementById("finish-task-title");
const finishYes = document.getElementById("finish-yes");
const finishNo = document.getElementById("finish-no");

// ----- Task actions -----

function addTask(title, importance) {
    tasks.push({
        id: nextId++,
        title,
        importance,
        completed: false,
        groupSeq: nextSeq(),
        doneSeq: 0,
    });
}

function deleteTask(id) {
    if (state.promptOpen) return;
    if (id === state.doingNowId) {
        clearDoingNow();
    }
    const index = tasks.findIndex((task) => task.id === id);
    if (index !== -1) tasks.splice(index, 1);
    if (editingId === id) editingId = null;
}

function completeTask(task) {
    task.completed = true;
    task.doneSeq = nextSeq();
    if (task.id === state.doingNowId) {
        clearDoingNow();
    }
}

function restoreTask(task) {
    task.completed = false;
    task.groupSeq = nextSeq();
}

function setImportance(task, importance) {
    if (task.importance === importance) return;
    task.importance = importance;
    // Completed tasks keep their spot until restored.
    if (!task.completed) {
        task.groupSeq = nextSeq();
    }
}

// ----- Doing Now + timer -----

function selectDoingNow(id) {
    if (state.promptOpen) return;
    const task = findTask(id);
    if (!task || task.completed) return;
    resetTimer();
    state.doingNowId = id;
}

function clearDoingNow() {
    resetTimer();
    state.doingNowId = null;
}

function startTimer() {
    if (state.intervalId !== null || state.promptOpen || !getDoingNowTask()) return;
    state.endTime = Date.now() + state.remainingSec * 1000;
    state.intervalId = setInterval(tick, 250);
    renderTimer();
}

function stopTimer() {
    if (state.intervalId !== null) {
        clearInterval(state.intervalId);
        state.intervalId = null;
    }
    state.endTime = null;
}

function resetTimer() {
    stopTimer();
    state.remainingSec = state.durationMin * 60;
    renderTimer();
}

function tick() {
    const remaining = Math.max(0, Math.ceil((state.endTime - Date.now()) / 1000));
    state.remainingSec = remaining;
    if (remaining === 0) {
        stopTimer();
        renderTimer();
        openFinishPrompt();
        return;
    }
    renderTimer();
}

function openFinishPrompt() {
    if (state.promptOpen) return;
    const task = getDoingNowTask();
    if (!task) return;
    state.promptOpen = true;
    finishTaskTitle.textContent = task.title;
    renderTimer();
    finishDialog.showModal();
}

function answerFinishPrompt(finished) {
    if (!state.promptOpen) return;
    state.promptOpen = false;
    finishDialog.close();
    const task = getDoingNowTask();
    if (finished && task) {
        completeTask(task); // also clears Doing Now and resets the timer
    } else {
        resetTimer();
    }
    render();
}

function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}

// ----- Rendering -----

function createButton(label, action, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.action = action;
    if (className) button.className = className;
    return button;
}

function createTaskItem(task) {
    const li = document.createElement("li");
    li.className = "task";
    li.dataset.id = task.id;
    if (task.completed) li.classList.add("completed");
    const isDoingNow = task.id === state.doingNowId && !task.completed;
    if (isDoingNow) li.classList.add("doing-now");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.completed;
    checkbox.dataset.action = "toggle";
    checkbox.setAttribute("aria-label", (task.completed ? "Restore " : "Complete ") + task.title);
    li.append(checkbox);

    if (editingId === task.id) {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "edit-input";
        input.value = task.title;
        input.dataset.role = "edit-input";
        input.setAttribute("aria-label", "Edit task title");
        li.append(input);

        const actions = document.createElement("div");
        actions.className = "task-actions";
        actions.append(
            createButton("Save", "save"),
            createButton("Cancel", "cancel", "secondary"));
        li.append(actions);

        const error = document.createElement("p");
        error.className = "error edit-error";
        error.setAttribute("role", "alert");
        li.append(error);
        return li;
    }

    const title = document.createElement("span");
    title.className = "task-title";
    title.textContent = task.title;
    li.append(title);

    if (isDoingNow) {
        const label = document.createElement("span");
        label.className = "badge doing-now-label";
        label.textContent = "Doing Now";
        li.append(label);
    }

    const badge = document.createElement("span");
    badge.className = "badge badge-" + task.importance;
    badge.textContent = task.importance;
    li.append(badge);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const importanceSelect = document.createElement("select");
    importanceSelect.dataset.action = "importance";
    importanceSelect.setAttribute("aria-label", "Change importance");
    IMPORTANCE_LEVELS.forEach((level) => {
        const option = document.createElement("option");
        option.value = level;
        option.textContent = level;
        option.selected = level === task.importance;
        importanceSelect.append(option);
    });
    actions.append(importanceSelect);

    if (!task.completed && !isDoingNow) {
        actions.append(createButton("Doing Now", "doing-now", "secondary"));
    }
    actions.append(
        createButton("Edit", "edit", "secondary"),
        createButton("Delete", "delete", "danger"));
    li.append(actions);
    return li;
}

function renderList() {
    taskList.replaceChildren(...getOrderedTasks().map(createTaskItem));
    emptyMsg.hidden = tasks.length > 0;
}

function renderTimer() {
    const task = getDoingNowTask();
    const running = state.intervalId !== null;
    doingNowTitle.textContent = task ? task.title : "No task selected";
    timeDisplay.textContent = formatTime(state.remainingSec);
    startBtn.disabled = !task || running || state.promptOpen;
    durationSelect.disabled = running || state.promptOpen;
    resetBtn.disabled = state.promptOpen;
    clearBtn.disabled = !task || state.promptOpen;
}

function render() {
    renderList();
    renderTimer();
}

// ----- Event handlers -----

addForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = newTitleInput.value.trim();
    if (!title) {
        addError.textContent = "Please enter a task title (it can't be blank).";
        newTitleInput.focus();
        return;
    }
    addTask(title, newImportanceSelect.value);
    addError.textContent = "";
    newTitleInput.value = "";
    newImportanceSelect.value = "Low";
    newTitleInput.focus();
    render();
});

newTitleInput.addEventListener("input", () => {
    addError.textContent = "";
});

function saveEdit(li, task) {
    const input = li.querySelector(".edit-input");
    const title = input.value.trim();
    if (!title) {
        li.querySelector(".edit-error").textContent = "Title can't be blank.";
        input.focus();
        return;
    }
    task.title = title;
    editingId = null;
    render();
}

taskList.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target || target.tagName === "SELECT") return;
    const li = target.closest(".task");
    const task = findTask(Number(li.dataset.id));
    if (!task) return;

    switch (target.dataset.action) {
        case "toggle":
            if (state.promptOpen) {
                event.preventDefault();
                return;
            }
            if (target.checked) completeTask(task);
            else restoreTask(task);
            break;
        case "doing-now":
            selectDoingNow(task.id);
            break;
        case "edit": {
            editingId = task.id;
            render();
            const input = taskList.querySelector(".edit-input");
            input.focus();
            input.select();
            return;
        }
        case "save":
            saveEdit(li, task);
            return;
        case "cancel":
            editingId = null;
            break;
        case "delete":
            deleteTask(task.id);
            break;
        default:
            return;
    }
    render();
});

taskList.addEventListener("change", (event) => {
    if (event.target.dataset.action !== "importance") return;
    const task = findTask(Number(event.target.closest(".task").dataset.id));
    if (!task) return;
    setImportance(task, event.target.value);
    render();
});

taskList.addEventListener("keydown", (event) => {
    if (event.target.dataset.role !== "edit-input") return;
    const li = event.target.closest(".task");
    const task = findTask(Number(li.dataset.id));
    if (event.key === "Enter") {
        saveEdit(li, task);
    } else if (event.key === "Escape") {
        editingId = null;
        render();
    }
});

durationSelect.addEventListener("change", () => {
    if (state.intervalId !== null) return;
    state.durationMin = Number(durationSelect.value);
    resetTimer();
});

startBtn.addEventListener("click", startTimer);
resetBtn.addEventListener("click", () => {
    if (state.promptOpen) return;
    resetTimer();
});
clearBtn.addEventListener("click", () => {
    if (state.promptOpen) return;
    clearDoingNow();
    render();
});

finishYes.addEventListener("click", () => answerFinishPrompt(true));
finishNo.addEventListener("click", () => answerFinishPrompt(false));
// Require an explicit Yes/No: block Escape from closing the dialog.
finishDialog.addEventListener("cancel", (event) => event.preventDefault());

// ----- Init -----

for (let minutes = 10; minutes <= 120; minutes += 10) {
    const option = document.createElement("option");
    option.value = minutes;
    option.textContent = minutes + " min";
    option.selected = minutes === state.durationMin;
    durationSelect.append(option);
}

render();
