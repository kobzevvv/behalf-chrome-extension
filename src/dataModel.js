// Centralized SQL used by the worker

export const queries = {
  // Selects the oldest task for a browser that has not yet been reported
  selectPendingTaskForBrowser: {
    text:
      'SELECT t.id, t.task, t.params_json, t.created_at '
      + 'FROM tasks_ques t '
      + 'LEFT JOIN worker_report r ON r.task_id = t.id '
      + 'WHERE t.browser_id = $1 AND r.id IS NULL '
      + 'ORDER BY t.created_at ASC LIMIT 1',
  },

  // Insert a worker report for a completed task
  insertWorkerReport: {
    text:
      'INSERT INTO worker_report (task_id, datime, task_name, version, artifacts_json) '
      + 'VALUES ($1, $2, $3, $4, $5)',
  },
};


