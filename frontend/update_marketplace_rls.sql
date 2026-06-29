
-- Enable RLS for marketplace_transactions
ALTER TABLE marketplace_transactions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view transactions where they are the buyer or seller
DROP POLICY IF EXISTS "View own transactions" ON marketplace_transactions;
CREATE POLICY "View own transactions" ON marketplace_transactions
FOR SELECT USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
