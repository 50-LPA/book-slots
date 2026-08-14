import React from 'react';

/**
 * Reusable Confirmation Delete Popup component.
 *
 * @param {boolean} isOpen - Whether modal is visible
 * @param {string} [title] - Header question / title
 * @param {string} [itemName] - Name/label of the item to delete
 * @param {string} [itemType] - Type prefix, e.g. "Slot for", "Candidate", "HR"
 * @param {function} onCancel - Callback when Cancel / Close is clicked
 * @param {function} onConfirm - Callback when Delete is clicked
 * @param {boolean} [isDeleting] - Loading state for delete action
 * @param {string} [deleteButtonText] - Text for delete button (default: "Delete")
 * @param {string} [cancelButtonText] - Text for cancel button (default: "Cancel")
 */
export default function ConfirmDeleteModal({
  isOpen,
  title = 'Are you sure you want to delete this item?',
  itemName,
  itemType = 'Slot for',
  onCancel,
  onConfirm,
  isDeleting = false,
  deleteButtonText = 'Delete',
  cancelButtonText = 'Cancel',
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-sm rounded-xl bg-white shadow-lg px-6 py-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-900">
            {title}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 hover:bg-slate-200 border border-slate-200"
            aria-label="Close"
          >
            <i className="fa-solid fa-xmark text-sm" aria-hidden="true" />
          </button>
        </div>
        {itemName && (
          <p className="text-xs text-slate-600 mb-4">
            {itemType}:{' '}
            <span className="font-semibold">{itemName}</span>
          </p>
        )}
        <div className="flex justify-between gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="px-3 py-1.5 text-xs font-semibold rounded-full border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
          >
            {cancelButtonText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-3 py-1.5 text-xs font-semibold rounded-full bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {isDeleting ? (
              <>
                <i className="fa-solid fa-spinner fa-spin text-xs" aria-hidden="true" />
                <span>Deleting...</span>
              </>
            ) : (
              deleteButtonText
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
