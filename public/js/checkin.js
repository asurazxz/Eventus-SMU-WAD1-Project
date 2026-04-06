// Owner notes inline editing on the check-in page.
// Depends on: EVENT_ID (injected inline by scan.ejs), showToast (from qrcode.js)
document.addEventListener('click', async (e) => {
  const row = e.target.closest('tr[data-user-id]');
  if (!row) return;

  // Show edit form
  if (e.target.classList.contains('js-edit-notes-btn')) {
    const notesCell = row.querySelector('[data-col="owner-notes"]');
    notesCell.querySelector('.owner-notes-display').style.display = 'none';
    e.target.style.display = 'none';
    notesCell.querySelector('.owner-notes-edit').style.display = 'block';
    notesCell.querySelector('.owner-notes-input').focus();
  }

  // Cancel edit
  if (e.target.classList.contains('js-cancel-notes-btn')) {
    const notesCell = row.querySelector('[data-col="owner-notes"]');
    notesCell.querySelector('.owner-notes-edit').style.display = 'none';
    notesCell.querySelector('.owner-notes-display').style.display = '';
    notesCell.querySelector('.js-edit-notes-btn').style.display = '';
  }

  // Save notes via AJAX
  if (e.target.classList.contains('js-save-notes-btn')) {
    const userId = e.target.dataset.userId;
    const notesCell = row.querySelector('[data-col="owner-notes"]');
    const notes = notesCell.querySelector('.owner-notes-input').value.trim();

    e.target.disabled = true;
    try {
      const res = await fetch(`/checkin/${EVENT_ID}/owner-notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, notes }),
      });
      const data = await res.json();
      if (data.success) {
        notesCell.querySelector('.owner-notes-display').innerHTML =
          data.ownerNotes || '<span style="color:#9ca3af;">—</span>';
        notesCell.querySelector('.owner-notes-edit').style.display = 'none';
        notesCell.querySelector('.owner-notes-display').style.display = '';
        notesCell.querySelector('.js-edit-notes-btn').style.display = '';
        showToast('Notes saved.', 'success');
      } else {
        showToast(data.message || 'Failed to save notes.', 'error');
      }
    } catch (err) {
      console.error('saveNotes error:', err);
      showToast('Failed to save notes.', 'error');
    } finally {
      e.target.disabled = false;
    }
  }
});
