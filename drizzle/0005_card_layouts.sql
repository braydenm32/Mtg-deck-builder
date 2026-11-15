-- Tokens, art cards, Theme cards and other non-deck layouts can't be commanders (some legendary tokens were flagged).
-- Legendary Vehicles and Spacecraft with power/toughness are picked up by the next card sync.
UPDATE `cards` SET `can_be_commander` = 0 WHERE `layout` IN ('token', 'double_faced_token', 'art_series', 'front_card', 'planar', 'scheme', 'vanguard', 'emblem');
