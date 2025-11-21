document.addEventListener('DOMContentLoaded', () => {
    loadQuestions();

    // Add Question Form
    document.getElementById('addQuestionForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const hints = Array.from(document.querySelectorAll('.hint-input'))
            .map(input => input.value.trim())
            .filter(value => value !== '');

        const data = {
            question: document.getElementById('question').value,
            answer: document.getElementById('answer').value,
            hints: hints,
            difficulty: document.getElementById('difficulty').value,
            category: document.getElementById('category').value
        };

        try {
            const response = await fetch('/api/questions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                alert('Frage erfolgreich erstellt!');
                e.target.reset();
                loadQuestions();
            } else {
                const error = await response.json();
                alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
            }
        } catch (err) {
            console.error(err);
            alert('Netzwerkfehler');
        }
    });

    // Edit Question Form
    document.getElementById('editQuestionForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('editId').value;
        const hints = [
            document.getElementById('editHint1').value.trim(),
            document.getElementById('editHint2').value.trim(),
            document.getElementById('editHint3').value.trim()
        ].filter(value => value !== '');

        const data = {
            question: document.getElementById('editQuestion').value,
            answer: document.getElementById('editAnswer').value,
            hints: hints,
            difficulty: document.getElementById('editDifficulty').value,
            category: document.getElementById('editCategory').value
        };

        try {
            const response = await fetch(`/api/questions/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                alert('Frage erfolgreich aktualisiert!');
                closeModal();
                loadQuestions();
            } else {
                const error = await response.json();
                alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
            }
        } catch (err) {
            console.error(err);
            alert('Netzwerkfehler');
        }
    });
});

async function loadQuestions() {
    try {
        const response = await fetch('/api/questions');
        const questions = await response.json();
        
        const list = document.getElementById('questionList');
        document.getElementById('questionCount').textContent = questions.length;
        list.innerHTML = '';

        questions.forEach(q => {
            const item = document.createElement('div');
            item.className = 'question-item';
            item.innerHTML = `
                <div class="question-content">
                    <strong>${escapeHtml(q.question)}</strong><br>
                    <small>Antwort: ${escapeHtml(q.answer)} | Kat: ${escapeHtml(q.category)} | Diff: ${q.difficulty}</small>
                </div>
                <div class="question-actions">
                    <button class="btn btn-edit" onclick="openEditModal('${q._id}')">Bearbeiten</button>
                    <button class="btn btn-delete" onclick="deleteQuestion('${q._id}')">Löschen</button>
                </div>
            `;
            list.appendChild(item);
        });
    } catch (err) {
        console.error('Fehler beim Laden der Fragen:', err);
    }
}

async function deleteQuestion(id) {
    if (!confirm('Möchten Sie diese Frage wirklich löschen?')) return;

    try {
        const response = await fetch(`/api/questions/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            loadQuestions();
        } else {
            alert('Fehler beim Löschen');
        }
    } catch (err) {
        console.error(err);
        alert('Netzwerkfehler');
    }
}

let currentQuestions = []; // Cache for edit modal

async function openEditModal(id) {
    try {
        // Fetch fresh data or find in cache if we had one (re-fetching is safer)
        const response = await fetch(`/api/questions/${id}`);
        const q = await response.json();

        document.getElementById('editId').value = q._id;
        document.getElementById('editQuestion').value = q.question;
        document.getElementById('editAnswer').value = q.answer;
        document.getElementById('editCategory').value = q.category;
        document.getElementById('editDifficulty').value = q.difficulty;

        document.getElementById('editHint1').value = q.hints[0] || '';
        document.getElementById('editHint2').value = q.hints[1] || '';
        document.getElementById('editHint3').value = q.hints[2] || '';

        document.getElementById('editModal').style.display = 'flex';
    } catch (err) {
        console.error(err);
        alert('Fehler beim Laden der Frage');
    }
}

function closeModal() {
    document.getElementById('editModal').style.display = 'none';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
