/**
 * Task Rule Engine — Authoritative Ruleset
 *
 * Schema: [order, title, description, url]
 *
 * Structure:
 *   tasks_by_type_and_stage → {deal_type} → {stage} → [order, title, description, url][]
 *
 * Deal types: "Standard Flip", "Double Close", "Subdivide"
 * Global key "*" applies to ALL deal types.
 *
 * Rule key formula:
 *   source_rule_key = {deal_type}::{stage}::{order_num}
 *   For global (*) rules: *::{stage}::{order_num}
 *   For Cancelled tasks with null order: *::Cancelled::notice, *::Cancelled::send_notice
 */

export type TaskTuple = [number | null, string, string | null, string | null];

export interface TaskRuleset {
  version: string;
  schema: string;
  tasks_by_type_and_stage: Record<string, Record<string, TaskTuple[]>>;
}

export const TASK_RULESET: TaskRuleset = {
  version: '1.0',
  schema: '[order, title, description, url]',
  tasks_by_type_and_stage: {
    'Standard Flip': {
      'Purchase Agreement Signed': [
        [1, 'Complete initial due diligence review', 'Run quick validation before deeper DD', null],
        [2, 'Get realtor price opinion', 'Ask realtor for estimated resale value', null],
      ],
      'Due Diligence': [
        [1, 'Complete due diligence (full DD sheet)', 'Verify all property data, access, zoning, wetlands, restrictions', null],
        [2, 'Get survey quote (if needed)', 'Obtain survey cost estimate before committing', null],
        [3, 'Get soil test quote (if needed)', 'Obtain soil/perc cost estimate', null],
        [4, 'Schedule survey (if needed)', 'Order survey if required', null],
        [5, 'Schedule soil test (if needed)', 'Order soil test if required', null],
        [6, 'Confirm deed matches sellers', 'Verify ownership matches PSA', null],
        [7, 'Decide to proceed to escrow', 'Finalize go/no-go decision', null],
      ],
      'Send to escrow': [
        [1, 'Send signed PA to closing company', 'Email PSA + seller packet to title', null],
        [2, 'Send seller contact info', 'Provide seller name, phone, email', null],
        [3, 'Send buyer/entity info (your info)', 'Send your LLC info + EIN', null],
        [4, 'Request title examination', 'Order title search', null],
        [5, 'Send EMD (if required)', 'Deliver earnest money', null],
        [6, 'Confirm EMD receipt', 'Ensure title confirms fund arrival', null],
        [7, 'Confirm title examination begun', 'Ensure title started processing', null],
        [8, 'Confirm names on deed', 'Ensure deed matches PA', null],
      ],
      'Purchase escrow': [
        [1, 'Confirm seller availability for closing week', 'Ensure seller able to sign in time', null],
        [2, 'Coordinate closing date', 'Work with title + seller', null],
        [3, 'Request initial HUD', 'Request draft HUD-1/CD', null],
        [4, 'Approve HUD or request revisions', 'Verify prorations, fees, vesting', null],
        [5, 'Add closing date to calendar', 'Add date/time to calendar', null],
      ],
      'Purchased': [
        [1, 'Choose a realtor', 'Select listing agent', null],
        [2, 'Get drone photos', 'Order drone media', null],
        [3, 'List on MLS', 'Agent lists property', null],
        [4, 'Weekly follow-up with realtor', 'Request listing activity updates', null],
      ],
      'Listed For Sale': [],
      'Sold': [
        [1, 'Save final HUD and closing documents', 'Store HUD + CD + closing file', null],
        [2, 'Save recorded deed', 'Store recorded deed safely', null],
        [3, 'Update KPI metrics', 'Update internal metrics', null],
      ],
    },
    'Double Close': {
      'Purchase Agreement Signed': [
        [1, 'Complete initial due diligence review', 'Quick verify double close viability', null],
        [2, 'Get realtor price opinion (if needed)', 'Ask realtor value', null],
      ],
      'Due Diligence': [
        [1, 'Complete due diligence (full DD sheet)', 'Validate all seller info + viability', null],
        [2, 'Confirm deed matches sellers', 'Verify ownership', null],
        [3, 'Decide to proceed to escrow', 'Finalize go/no-go decision', null],
      ],
      'Send to escrow': [
        [1, 'Send PA to closing company (A+B)', 'Send PSA + info', null],
        [2, 'Send buyer PA to closing company (B+C)', 'Send resale PSA', null],
        [3, 'Send entity info', 'Send your LLC info', null],
        [4, 'Request title examination', 'Order title search', null],
        [5, 'Send EMD', 'Deliver earnest money', null],
        [5, 'Confirm EMD receipt', 'Confirm with title', null],
        [6, 'Request title examination', 'Request title work', null],
        [7, 'Confirm title examination begun', 'Title confirmed started', null],
      ],
      'Purchase escrow': [
        [1, 'Confirm seller availability for closing week', 'Ensure seller ready', null],
        [2, 'Coordinate double-close date (A+B then B+C)', 'Coordinate timing', null],
        [3, 'Request initial HUDs (A+B and B+C)', 'Request draft HUDs', null],
        [4, 'Approve HUDs', 'Verify profit, fees', null],
        [5, 'Add closing date to calendar', 'Add date', null],
      ],
      'Purchased': [
        [1, 'Collect buyer info for resale (entity/email/phone)', 'Gather buyer data', null],
        [2, 'Confirm buyer understands double-close timing', 'Ensure buyer prepared', null],
        [3, 'Choose realtor / dispo channel (if using agent)', 'Select agent', null],
        [4, 'Get drone photos', 'Order drone media', null],
        [5, 'Weekly follow-up with realtor', 'Request updates', null],
      ],
      'Listed For Sale': [],
      'Sold': [
        [1, 'Save final HUDs and closing documents', 'Store files', null],
        [2, 'Save recorded deed (if you took title)', 'Store deed', null],
        [3, 'Update KPI metrics', 'Update metrics', null],
      ],
    },
    'Subdivide': {
      'Purchase Agreement Signed': [
        [1, 'Complete initial due diligence review', 'Quick feasibility check for subdivide', null],
        [2, 'Get realtor price opinion (parent + children)', 'Ask realtor to estimate values', null],
      ],
      'Due Diligence': [
        [1, 'Complete due diligence (full DD sheet)', 'Run full DD on parent parcel', null],
        [2, 'Confirm county split requirements', 'Verify exempt/minor/major split rules', null],
        [3, 'Get survey quote', 'Collect estimate for subdivision survey', null],
        [4, 'Get soil test quote (if needed)', 'Collect cost estimate', null],
        [5, 'Schedule survey', 'Order subdivision survey', null],
        [6, 'Schedule soil test (if needed)', 'Order soil evaluation', null],
        [7, 'Confirm deed matches sellers', 'Verify ownership', null],
        [8, 'Decide to proceed to escrow', 'Finalize go/no-go decision', null],
      ],
      'Send to escrow': [
        [1, 'Send signed PA to closing company', 'Send PSA + info to title', null],
        [2, 'Send seller contact info', 'Provide seller details', null],
        [3, 'Send entity info', 'Send your LLC details', null],
        [4, 'Request title examination', 'Order title search', null],
        [5, 'Send EMD', 'Deliver earnest money', null],
        [6, 'Confirm EMD receipt', 'Confirm with title', null],
        [7, 'Confirm title examination begun', 'Ensure title started', null],
      ],
      'Purchase escrow': [
        [1, 'Manage surveyor', 'Track survey progress', null],
        [2, 'Confirm seller availability for closing week', 'Ensure seller can sign', null],
        [3, 'Coordinate closing date', 'Coordinate with title + seller', null],
        [4, 'Request initial HUD', 'Request draft HUD', null],
        [5, 'Approve HUD', 'Verify fees, prorations', null],
        [6, 'Add closing date to calendar', 'Add to calendar', null],
      ],
      'Purchased': [
        [1, 'Choose a realtor for child lots', 'Select listing agent', null],
        [2, 'Get drone photos of subdivided lots', 'Order drone media', null],
        [3, 'List each lot on MLS', 'Create separate listings', null],
        [4, 'Weekly follow-up with realtor', 'Request updates', null],
      ],
      'Listed For Sale': [],
      'Sold': [
        [1, 'Save final HUD and closing documents', 'Store closing file', null],
        [2, 'Save recorded deed + final survey/plat', 'Store deed + plat map', null],
        [3, 'Add each child lot as separate deals', 'Create records for each lot', null],
        [4, 'Update KPI metrics', 'Update internal metrics', null],
      ],
    },
    '*': {
      'Sale escrow': [
        [1, 'Confirm closing date', null, null],
        [2, 'Get HUD/ALTA', null, null],
        [3, 'Notarize closing docs', null, null],
        [4, 'Send closing docs to closing company', null, null],
      ],
      'Cancelled': [
        [null, 'Create notice of cancellation', null, null],
        [null, 'Send signed notice of cancellation to seller and closing company', null, null],
      ],
    },
  },
};
