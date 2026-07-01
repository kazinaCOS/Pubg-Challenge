const IPC = {
  GET_STATE: 'app:getState',
  NEW_TASK: 'app:newTask',
  COMPLETE_TASK: 'app:completeTask',
  FAIL_TASK: 'app:failTask',
  CLEAR_PUNISHMENT: 'app:clearPunishment',
  NEW_TASK_WITHOUT_PUNISHMENT: 'app:newTaskWithoutPunishment',
  UPDATE_SETTINGS: 'app:updateSettings',
  STATE_UPDATED: 'app:stateUpdated',
  CONTROL_READY: 'control:ready',
  OVERLAY_READY: 'overlay:ready'
};

module.exports = IPC;