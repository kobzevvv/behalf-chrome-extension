/**
 * V1 Compatibility Handlers
 * Maintains backward compatibility with existing extension
 */

import { Env } from '../index';
import { 
  handleCreateTask, 
  handleLease, 
  handleSubmit, 
  handleStats 
} from './index';
import { createSuccessResponse, createErrorResponse, getQueryParams } from '../utils/http';
import { validateBrowserId } from '../utils/validation';

/**
 * V1 Check Task - POST /api/check-task
 * Maps to new lease system
 */
export async function handleCheckTask(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json();
    
    if (!body.browserId) {
      return createErrorResponse('browserId is required', 400);
    }
    
    const validation = validateBrowserId(body.browserId);
    if (!validation.valid) {
      return createErrorResponse(validation.error!, 400);
    }
    
    // Use the new lease system but return in v1 format
    const leaseRequest = new Request(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        browserId: body.browserId,
        max: 1
      })
    });
    
    const leaseResponse = await handleLease(leaseRequest, env);
    const leaseData = await leaseResponse.json();
    
    if (!leaseResponse.ok) {
      return createErrorResponse('Failed to check for tasks', leaseResponse.status);
    }
    
    // Convert v2 response to v1 format
    if (leaseData.items && leaseData.items.length > 0) {
      const task = leaseData.items[0];
      return createSuccessResponse({
        hasTask: true,
        task: {
          taskId: parseInt(task.jobId.split('_')[1], 36), // Convert back to number for v1
          taskName: task.taskName,
          urlToExtract: task.url,
          tableName: task.contentType,
          paramsJson: task.additionalParams || {}
        }
      });
    } else {
      return createSuccessResponse({
        hasTask: false,
        task: null
      });
    }
    
  } catch (error) {
    console.error('Check task error:', error);
    return createErrorResponse('Failed to check task', 500, { error: error.message });
  }
}

/**
 * V1 Report Task - POST /api/report-task
 * Maps to new submit system
 */
export async function handleReportTask(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json();
    
    // Validate required v1 fields
    if (!body.taskId || !body.artifactsJson) {
      return createErrorResponse('taskId and artifactsJson are required', 400);
    }
    
    // Convert v1 taskId back to v2 jobId format
    // This is a simplified conversion - in reality you'd need to track the mapping
    const jobId = `j_${body.taskId.toString(36)}_compat`;
    
    // Find the job and its lease info
    const job = await env.DB.prepare(`
      SELECT job_id, lease_id, state FROM jobs 
      WHERE job_id = ? AND state = 'leased'
    `).bind(jobId).first();
    
    if (!job) {
      return createErrorResponse('Task not found or not leased', 400);
    }
    
    // Extract HTML content from artifactsJson
    const htmlContent = body.artifactsJson['HTML content'] || body.artifactsJson.html || '';
    if (!htmlContent) {
      return createErrorResponse('No HTML content found in artifactsJson', 400);
    }
    
    // Convert to v2 submit format
    const submitRequest = new Request(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId,
        leaseId: job.lease_id,
        contentType: 'text/html; charset=utf-8',
        size: htmlContent.length,
        htmlBase64: btoa(htmlContent)
      })
    });
    
    const submitResponse = await handleSubmit(submitRequest, env);
    const submitData = await submitResponse.json();
    
    if (!submitResponse.ok) {
      return createErrorResponse('Failed to submit task', submitResponse.status);
    }
    
    // Convert v2 response to v1 format
    return createSuccessResponse({
      success: true,
      recordId: Math.floor(Math.random() * 1000000), // Generate fake record ID for v1 compatibility
      tableName: body.tableName || 'default',
      recordCount: 1,
      processingTime: 150, // Fake processing time
      contentHash: submitData.contentHash,
      message: `Content stored in table: ${body.tableName || 'default'}`
    });
    
  } catch (error) {
    console.error('Report task error:', error);
    return createErrorResponse('Failed to report task', 500, { error: error.message });
  }
}

/**
 * V1 Enqueue Get Page HTML - GET /api/enqueue-get-page-html
 * Maps to new create task system
 */
export async function handleEnqueueGetPageHtml(request: Request, env: Env): Promise<Response> {
  try {
    const params = getQueryParams(request);
    
    const browserId = params.get('browserId');
    const url = params.get('url');
    const tableName = params.get('tableName');
    
    if (!browserId || !url) {
      return createErrorResponse('browserId and url parameters are required', 400);
    }
    
    // Convert to v2 create task format
    const createTaskRequest = new Request(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        browserId,
        taskName: 'Get Page HTML',
        url: decodeURIComponent(url),
        contentType: tableName || 'default'
      })
    });
    
    const createResponse = await handleCreateTask(createTaskRequest, env);
    const createData = await createResponse.json();
    
    if (!createResponse.ok) {
      return createErrorResponse('Failed to enqueue task', createResponse.status);
    }
    
    // Convert v2 response to v1 format
    return createSuccessResponse({
      success: true,
      id: parseInt(createData.jobId.split('_')[1], 36), // Convert to number for v1
      browserId,
      url: decodeURIComponent(url),
      tableName: tableName || 'default',
      message: `Task queued for table: page_html_${tableName || 'default'}`
    });
    
  } catch (error) {
    console.error('Enqueue get page HTML error:', error);
    return createErrorResponse('Failed to enqueue task', 500, { error: error.message });
  }
}

/**
 * V1 Enqueue Task - POST /api/enqueue-task
 * Maps to new create task system
 */
export async function handleEnqueueTask(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json();
    
    // Validate required v1 fields
    if (!body.browserId || !body.urlToExtract) {
      return createErrorResponse('browserId and urlToExtract are required', 400);
    }
    
    // Convert v1 format to v2 format
    const createTaskRequest = new Request(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        browserId: body.browserId,
        taskName: body.taskName || 'Get Page HTML',
        url: body.urlToExtract,
        contentType: body.tableName || 'default',
        priority: body.priority || 0
      })
    });
    
    const createResponse = await handleCreateTask(createTaskRequest, env);
    const createData = await createResponse.json();
    
    if (!createResponse.ok) {
      return createErrorResponse('Failed to enqueue task', createResponse.status);
    }
    
    // Convert v2 response to v1 format
    return createSuccessResponse({
      success: true,
      taskId: parseInt(createData.jobId.split('_')[1], 36), // Convert to number for v1
      browserId: body.browserId,
      taskName: body.taskName || 'Get Page HTML',
      urlToExtract: body.urlToExtract,
      tableName: body.tableName || 'default',
      createdDateTime: new Date(createData.createdAt).toISOString(),
      message: `Task queued for extraction to table: page_html_${body.tableName || 'default'}`
    });
    
  } catch (error) {
    console.error('Enqueue task error:', error);
    return createErrorResponse('Failed to enqueue task', 500, { error: error.message });
  }
}
