import { z } from 'zod';

// ===== Deal Schemas =====

export const DealTypeSchema = z.enum(['Standard Flip', 'Double Close', 'Subdivide']);

export const DealStageSchema = z.enum([
  'Offer accepted',
  'Due Diligence',
  'Send to escrow',
  'Purchase escrow',
  'Purchased',
  'Sale escrow',
  'Sold',
  'Cancelled',
]);

export const TaskStatusSchema = z.enum(['To Do', 'In Progress', 'Done', 'Skipped']);

export const FileCategorySchema = z.enum([
  'purchase_agreement', 'funding_agreement', 'deed', 'plat',
  'soil_test', 'hud', 'sale_contract', 'other',
]);

// ===== IPC Input Schemas =====

export const CreateDealSchema = z.object({
  deal_name: z.string().min(1),
  deal_type: DealTypeSchema.default('Standard Flip'),
  stage: DealStageSchema.default('Offer accepted'),
  county: z.string().default(''),
  state: z.string().default(''),
  purchase_price: z.number().default(0),
  expected_sales_price: z.number().default(0),
  notes: z.string().optional(),
  phone_number: z.string().optional(),
  contract_execution_date: z.string().optional(),
  expected_close_date: z.string().optional(),
  due_diligence_link: z.string().optional(),
});

export const UpdateDealSchema = z.object({
  deal_name: z.string().optional(),
  deal_type: DealTypeSchema.optional(),
  stage: DealStageSchema.optional(),
  county: z.string().optional(),
  state: z.string().optional(),
  purchase_price: z.number().optional(),
  expected_sales_price: z.number().optional(),
  notes: z.string().optional(),
  phone_number: z.string().optional(),
  contract_execution_date: z.string().nullable().optional(),
  expected_close_date: z.string().nullable().optional(),
  close_date: z.string().nullable().optional(),
  due_diligence_link: z.string().optional(),
  assigned_to: z.any().optional(),
});

export const CreateTaskSchema = z.object({
  deal_id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  status: TaskStatusSchema.default('To Do'),
  assignee: z.string().optional(),
  notes: z.string().optional(),
  task_order: z.number().optional(),
});

export const UpdateTaskSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  status: TaskStatusSchema.optional(),
  assignee: z.string().nullable().optional(),
  notes: z.string().optional(),
  task_order: z.number().optional(),
});

export const CreateDeadlineSchema = z.object({
  deal_id: z.string().min(1),
  label: z.string().min(1),
  due_date: z.string().min(1),
});

export const UpdateDeadlineSchema = z.object({
  label: z.string().optional(),
  due_date: z.string().optional(),
  is_acknowledged: z.boolean().optional(),
});

export const StageChangeWarningSchema = z.object({
  dealId: z.string(),
  newStage: DealStageSchema,
  force: z.boolean().default(false),
});

// ===== Setting Schemas =====

export const SettingKeySchema = z.enum([
  'fub_api_key',
  'fub_account_name',
  'anthropic_api_key',
]);

export type SettingKey = z.infer<typeof SettingKeySchema>;

// ===== Type exports =====

export type CreateDealInput = z.infer<typeof CreateDealSchema>;
export type UpdateDealInput = z.infer<typeof UpdateDealSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
export type CreateDeadlineInput = z.infer<typeof CreateDeadlineSchema>;
export type UpdateDeadlineInput = z.infer<typeof UpdateDeadlineSchema>;
