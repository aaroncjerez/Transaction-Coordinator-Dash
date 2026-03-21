/**
 * Shared DealViewData type and mapping function.
 * Eliminates the DealData / DealDetailData duplication across
 * DealDrawer, DealDetail, and DealOverview.
 */

export interface DealViewData {
  id: string;
  deal_name: string;
  deal_type?: string;
  stage: string;
  county: string;
  state: string;
  purchase_price: number;
  expected_sales_price: number;
  contract_date: string;
  close_date: string;
  possession_date?: string;
  contract_end_date?: string;
  phone_number: string;
  email?: string;
  notes: string;
  fub_person_id?: string;
  // Parcel
  parcel_number?: string;
  parcel_zip?: string;
  parcel_link?: string;
  lot_acreage?: string;
  drone_photo_link?: string;
  // Financials (extra)
  seller_bottom_price?: number;
  double_close_offer?: number;
  realtor_price_opinion?: number;
  misc_deal_expenses?: string;
  // Due Diligence
  mortgage_on_property?: string;
  hoa_poa_on_property?: string;
  title_search?: string;
  title_exam?: string;
  survey?: string;
  soil_test?: string;
  // Title Company
  title_company_name?: string;
  title_company_phone?: string;
  title_company_email?: string;
  // Team
  funder_name?: string;
  realtor_name?: string;
  reference_number?: string;
  // Fees (v13)
  transactional_funding_fee?: number;
  realtor_fee_percent?: number;
  realtor_fee_amount?: number;
  improvement_costs?: number;
  misc_fees?: number;
  realized_gross_profit?: number;
  // Jerez Land share (v14)
  jl_share_percent?: number;
  jl_share_amount?: number;
}

/**
 * Maps raw DB deal record to the canonical DealViewData shape.
 * Handles defaults, field renames (contract_execution_date → contract_date),
 * and undefined coercion for optional fields.
 */
export function mapDealData(raw: Record<string, any>): DealViewData {
  return {
    id: raw.id,
    deal_name: raw.deal_name || 'Unnamed Deal',
    deal_type: raw.deal_type || 'Unclassified',
    stage: raw.stage || 'Purchase Agreement Signed',
    county: raw.county || '',
    state: raw.state || '',
    purchase_price: raw.purchase_price || 0,
    expected_sales_price: raw.expected_sales_price || 0,
    contract_date: raw.contract_execution_date || 'TBD',
    close_date: raw.close_date || 'TBD',
    possession_date: raw.possession_date || undefined,
    contract_end_date: raw.contract_end_date || undefined,
    phone_number: raw.phone_number || '',
    email: raw.email || undefined,
    notes: raw.notes || '',
    fub_person_id: raw.fub_person_id || undefined,
    // Parcel
    parcel_number: raw.parcel_number || undefined,
    parcel_zip: raw.parcel_zip || undefined,
    parcel_link: raw.parcel_link || undefined,
    lot_acreage: raw.lot_acreage || undefined,
    drone_photo_link: raw.drone_photo_link || undefined,
    // Financials (extra)
    seller_bottom_price: raw.seller_bottom_price || undefined,
    double_close_offer: raw.double_close_offer || undefined,
    realtor_price_opinion: raw.realtor_price_opinion || undefined,
    misc_deal_expenses: raw.misc_deal_expenses || undefined,
    // Due Diligence
    mortgage_on_property: raw.mortgage_on_property || undefined,
    hoa_poa_on_property: raw.hoa_poa_on_property || undefined,
    title_search: raw.title_search || undefined,
    title_exam: raw.title_exam || undefined,
    survey: raw.survey || undefined,
    soil_test: raw.soil_test || undefined,
    // Title Company
    title_company_name: raw.title_company_name || undefined,
    title_company_phone: raw.title_company_phone || undefined,
    title_company_email: raw.title_company_email || undefined,
    // Team
    funder_name: raw.funder_name || undefined,
    realtor_name: raw.realtor_name || undefined,
    reference_number: raw.reference_number || undefined,
    // Fees
    transactional_funding_fee: raw.transactional_funding_fee || 0,
    realtor_fee_percent: raw.realtor_fee_percent || 0,
    realtor_fee_amount: raw.realtor_fee_amount || 0,
    improvement_costs: raw.improvement_costs || 0,
    misc_fees: raw.misc_fees || 0,
    realized_gross_profit: raw.realized_gross_profit || 0,
    // JL share
    jl_share_percent: raw.jl_share_percent || 0,
    jl_share_amount: raw.jl_share_amount || 0,
  };
}
