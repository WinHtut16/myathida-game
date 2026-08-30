-- Demo seed (optional). Mirrors src/lib/mock/seed.ts.
-- Superadmin staff row must reference a real auth.users id — create that user
-- in the Supabase dashboard first, then insert its staff row separately.

insert into pricing (tier, rate_per_hour, min_minutes) values
  ('PS4', 3000, 30),
  ('PS5', 5000, 30),
  ('VIP', 7000, 30);

insert into stations (name, tier, status, occupied, sort_order) values
  ('TV 1', 'PS4', 'available', false, 1),
  ('TV 2', 'PS4', 'available', false, 2),
  ('TV 3', 'PS4', 'available', false, 3),
  ('TV 4', 'PS4', 'available', false, 4),
  ('TV 5', 'PS4', 'available', false, 5),
  ('TV 6', 'PS4', 'available', false, 6),
  ('TV 7', 'PS4', 'available', false, 7),
  ('TV 8', 'PS5', 'available', false, 8),
  ('TV 9', 'PS5', 'available', false, 9),
  ('VIP',  'VIP', 'available', false, 10);

insert into products (name_en, name_my, category, price, stock, active) values
  ('Coca-Cola', 'ကိုကာကိုလာ', 'drink', 1000, 48, true),
  ('Potato Chips', 'အာလူးကြော်', 'snack', 1000, 22, true),
  ('Energy Drink', 'စွမ်းအင်အချိုရည်', 'drink', 2000, 12, true),
  ('Instant Noodles', 'ခေါက်ဆွဲ', 'snack', 1500, 10, true),
  ('Chocolate Bar', 'ချောကလက်', 'snack', 1200, 15, true),
  ('Peanuts', 'မြေပဲ', 'snack', 800, 30, true),
  ('Water', 'သောက်ရေ', 'drink', 500, 60, true);
