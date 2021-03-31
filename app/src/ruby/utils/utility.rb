module Utility
  class << self
    def get_user_by_username(username, client)
      sql = "SELECT * from users WHERE username = '#{username}'"
      client.query(sql).to_a.first
    rescue StandardError => _e
      nil
    end

    def password_hash(salt, password)
      str = password + salt
      100.times do
        str = SHA3::Digest::SHA512.hexdigest(str)
      end

      str
    end

    def password_salt
      SecureRandom.hex(64)
    end

    def correct_user?(user, req_password)
      return false if user.nil?

      (password_hash(user[:salt], req_password) == user&.dig(:password_hash))
    end

    def get_user(id, client)
      sql = "SELECT * from users WHERE id = #{id}"
      client.query(sql).to_a.first
    end

    def get_event(id, client)
      sql = "SELECT id, user_id, venue_id, eventgenre_id, name, start_at, end_at, price, created_at, updated_at FROM events WHERE id = #{id}"
      client.query(sql).to_a.first
    end

    def get_events(client, **args)
      sql = 'SELECT id, user_id, venue_id, eventgenre_id, name, start_at, end_at, price, created_at, updated_at FROM events WHERE DATE(NOW()) <= start_at'

      unless args[:user_id].nil?
        sql += " AND user_id = #{args[:user_id]}"
      end

      unless args[:limit].nil? || args[:offset].nil?
        sql += " LIMIT #{args[:limit]} OFFSET #{args[:offset]}"
      end

      client.query(sql).to_a
    end

    def get_venue(id, client)
      sql = "SELECT * from venues WHERE id = #{id}"
      client.query(sql).to_a.first
    end

    def get_venues(client, **args)
      sql = 'SELECT * from venues'

      unless args[:limit].nil? || args[:offset].nil?
        sql += " LIMIT #{args[:limit]} OFFSET #{args[:offset]}"
      end

      client.query(sql).to_a
    end

    def get_reservation_by_user_and_event_id(user_id, event_id, client)
      sql = "SELECT * from reservations where user_id = #{user_id} and event_id = #{event_id}"
      client.query(sql).to_a.first
    end

    def get_reservations(client, **args)
      sql = 'SELECT * FROM reservations'

      if !args[:user_id].nil?
        sql += " WHERE user_id = #{args[:user_id]}"
      elsif !args[:event_id].nil?
        sql += " WHERE event_id = #{args[:event_id]}"
      end

      unless args[:limit].nil? || args[:offset].nil?
        sql += " LIMIT #{args[:limit]} OFFSET #{args[:offset]}"
      end

      client.query(sql).to_a
    end

    def get_reservation(resv_id, client)
      sql = "SELECT * from reservations where id = #{resv_id}"
      client.query(sql).to_a.first
    end

    def get_timeslots_by_event(event_id, client)
      sql = "SELECT * from timeslots where event_id = #{event_id}"
      client.query(sql).to_a
    end

    def event_capacity(event_id, client)
      event_sql = "SELECT * from events where id = #{event_id}"
      event = client.query(event_sql).to_a.first

      venue_sql = "select * from venues where id = #{event[:venue_id]}"
      venue = client.query(venue_sql).to_a.first

      venue[:capacity]
    end

    def accessible_event?(user, event)
      case user[:role]
      when 'artist'
        user[:id] == event[:user_id]
      else
        true
      end
    end

    def accessible_reservation?(user, reservation, client)
      case user[:role]
      when 'audience'
        user[:id] == reservation[:user_id]
      when 'artist'
        event = get_event(reservation[:event_id], client)
        user[:id] == event[:user_id]
      when 'owner'
        true
      end
    end

    def reservation_count(event_id, client)
      sql = "SELECT * from reservations where event_id = #{event_id}"
      reservations = client.query(sql).to_a

      reservations.map { |h| h[:num_of_resv] }.sum
    end

    def generate_event_response(event, client)
      venue = get_venue(event[:venue_id], client)
      artist = get_user(event[:user_id], client)
      reservations = reservation_count(event[:id], client)

      timeslots = get_timeslots_by_event(event[:id], client).map { |t| t[:id] }

      {
        id: event[:id],
        event_name: event[:name],
        event_genre_id: event[:eventgenre_id],
        artist_id: artist[:id],
        artist_name: artist[:username],
        timeslot_ids: timeslots,
        venue_id: venue[:id],
        venue_name: venue[:name],
        price: event[:price],
        start_at: format_time(event[:start_at]),
        end_at: format_time(event[:end_at]),
        created_at: format_time(event[:created_at]),
        updated_at: format_time(event[:updated_at]),
        capacity: venue[:capacity],
        current_resv: reservations
      }
    end

    def generate_reservation_response(reservation, client)
      event = get_event(reservation[:event_id], client)
      venue = get_venue(event[:venue_id], client)
      user = get_user(reservation[:user_id], client)

      {
        id: reservation[:id],
        user_id: user[:id],
        username: user[:username],
        event_id: reservation[:event_id],
        event_name: event[:name],
        event_price: event[:price],
        event_start_at: format_time(event[:start_at]),
        event_end_at: format_time(event[:end_at]),
        venue_name: venue[:name],
        num_of_resv: reservation[:num_of_resv],
        created_at: format_time(reservation[:created_at]),
        updated_at: format_time(reservation[:updated_at])
      }
    end

    def parse_time(time)
      Time.parse(time).utc.iso8601[0..-2]
    end

    def format_time(time)
      time.utc.iso8601
    end

    def end_of_month(time)
      day = Date.new(time.year, time.month, -1).day
      "#{time.year}-#{time.month}-#{day}T23:59:59#{time.zone}"
    end
  end
end
