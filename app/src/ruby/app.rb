Bundler.require(:default, ENV['NISCON_ENV'] || 'development')

require 'logger'
require 'sinatra/custom_logger'
require 'sinatra/reloader'
require 'rack/contrib'

require_relative 'utils/utility'

$db_params = {
  host: ENV.fetch('MYSQL_HOST'),
  username: ENV.fetch('MYSQL_USER'),
  password: ENV.fetch('MYSQL_PASSWORD'),
  database: ENV.fetch('MYSQL_DATABASE'),
  reconnect: true
}

JWT_SECRET_KEY = ENV.fetch('JWT_SECRET_KEY', 'da4855bf92b81fafaa170ba2aa9757c4').freeze

TOKEN_REVOCATION_LIST_FILE = ENV.fetch('REVOCATION_LIST_PATH', File.join(File.dirname(__FILE__), 'TokenRevocationList.dat')).freeze

Mysql2::Client.default_query_options.merge!(symbolize_keys: true)

class AccessError < StandardError
  def initialize(code:, message: 'something wrong.')
    @response_code = code
    @response_message = { message: message }
  end

  def response
    [@response_code, { 'Content-Type' => 'application/json' }, [@response_message.to_json]]
  end
end

class AccessErrorWrapper
  def initialize(app)
    @app = app
    @logger = Logger.new(STDOUT)
    @logger.level = 0
  end

  def call(env)
    @app.call(env)
  rescue AccessError => e
    @logger.warn(e)
    @logger.info(e.response)
    e.response
  rescue StandardError => e
    @logger.error(e)
    [500, json({ message: 'Internal server error' })]
  end
end

class App < Sinatra::Base
  helpers Sinatra::CustomLogger

  configure :development do
    logger = Logger.new(STDOUT)
    logger.level = 0

    set :logger, logger
  end

  use AccessErrorWrapper
  use Rack::JSONBodyParser

  set :public_folder, File.dirname(__FILE__) + '/public'

  before do
    @mysql = Mysql2::Client.new($db_params)
  end

  after do
    @mysql.close
  end

  helpers do
    # validatorの挙動は，基本的には以下の通り
    # 問題あり: raise AccessError
    # 問題なし: 値をかえしたり，返さなかったり

    def validate_access_token(authorization_header)
      raise AccessError.new(code: 401, message: 'Invalid credentials.') if authorization_header.nil?

      File.foreach(TOKEN_REVOCATION_LIST_FILE) do |l|
        raise AccessError.new(code: 401, message: 'Invalid credentials.') if l.chomp == authorization_header
      end

      # "Bearer #{access_token}" という形で入ってくるので，access_toke部分を切り出し
      access_token = authorization_header.split[1]
      payload, _header = JWT.decode(access_token, JWT_SECRET_KEY, 'HS256')

      # jwtのキーは， :exp, :iat, :username, :role
      payload.transform_keys(&:to_sym)
    rescue JWT::DecodeError
      raise AccessError.new(code: 401, message: 'Invalid credentials.')
    rescue JWT::ExpiredSignature
      raise AccessError.new(code: 403, message: 'Access declined.')
    end

    def generate_access_token(username, role)
      payload = {
        # 一致しないように，発行から1hの有効期限を設ける
        exp: (Time.now + (60 * 60)).to_i,
        iat: Time.now.to_i,
        username: username,
        role: role
      }

      JWT.encode(payload, JWT_SECRET_KEY, 'HS256')
    end

    def validate_role(user_role, required_roles)
      # user_roleがrequired_roleに含まれるか
      raise AccessError.new(code: 403, message: 'Access declined.') unless required_roles.include?(user_role)
    end

    def validate_reservation(user_id, event_id, event_capacity, req_num_of_resv)
      raise AccessError.new(code: 409, message: 'Tickets are all gone.') unless Utility.get_reservation_by_user_and_event_id(user_id, event_id, @mysql).nil?
      raise AccessError.new(code: 409, message: 'Tickets are all gone.') if event_capacity < (Utility.reservation_count(event_id, @mysql) + req_num_of_resv)
    end

    def validate_id_param(id)
      # idはinteger
      # sinatraのurl queryはStringであるため，文字列として検証している
      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') unless /^-?[[:digit:]]+$/.match? id
    end

    def validate_paging(limit, offset)
      # limit / offsetはintegerかつ0以上
      # sinatraのurl queryはStringであるため，文字列として検証している

      return if limit.nil? || offset.nil?

      [limit, offset].each do |param|
        raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') unless /^-?[[:digit:]]+$/.match? param
        raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') unless param.to_i >= 0
      end
    end

    def validate_event_genre(event_genre_id)
      # event_genre_idはintegerかつ正整数
      # sinatraのurl queryはStringであるため，文字列として検証している

      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') unless event_genre_id.is_a?(Integer) && event_genre_id.positive?

      sql = "SELECT * FROM eventgenres WHERE id = #{event_genre_id}"
      event_genre = @mysql.query(sql).to_a.first

      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') if event_genre.nil?
    end

    def validate_venue(venue_id)
      # event_genre_idはintegerかつ正整数
      # sinatraのurl queryはStringであるため，文字列として検証している

      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') unless venue_id.is_a?(Integer) && venue_id.positive?

      sql = "SELECT * FROM venues WHERE id = #{venue_id}"
      venue = @mysql.query(sql).to_a.first

      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') if venue.nil?
    end

    def validate_timeslot_ids(timeslot_ids)
      # event_genre_idはintegerかつ正整数
      # sinatraのurl queryはStringであるため，文字列として検証している

      if !timeslot_ids.is_a?(Array) || timeslot_ids.size.zero? || timeslot_ids.size > 2
        raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.')
      end
      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') unless timeslot_ids.all? { |v| v.is_a?(Integer) }
    end

    def validate_timeslots(timeslots)
      # timeslotsが，下記の条件をみたすかをチェック
      # - nilでないか
      # - 複数のtimeslotの会場が一致しているか
      # - 複数のtimeslotが同一の日にちであるか

      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') if timeslots.include? nil
      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') unless timeslots.map { |t| t[:venue_id] }.uniq.size == 1
      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') unless timeslots.map { |t| t[:start_at].day }.uniq.size == 1
    end

    def validate_start_end_time(start_at, end_at, timeslots)
      # start_at/end_atについて下記の条件を満たしているかをチェックする
      # - iso8601のフォーマット
      # - start_at <= end_at
      # - start_at ~ end_at が 与えられたtimeslotに収まっている

      # start_atでソート
      timeslots.sort! { |a, b| a[:start_at] <=> b[:start_at] }

      begin
        parsed_start_at = Time.iso8601(start_at)
        parsed_end_at = Time.iso8601(end_at)
      rescue ArgumentError
        raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.')
      end

      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') if parsed_start_at > parsed_end_at
      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') if timeslots.first[:start_at] > parsed_start_at
      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') if timeslots.last[:end_at] < parsed_end_at
    end
  end

  '/'.tap do |root|
    get root do
      send_file File.join(settings.public_folder, 'index.html')
    end
  end

  '/api/initialize'.tap do |init|
    post init do
      system('bash scripts/init.sh', exception: true)

      # 販促実施に応じて，ここの値を変更してください
      # 詳しくは，specを参照してください．
      # https://portal.ptc.ntt.dev/spec.html#tag/other
      [200, '1']
    end
  end

  '/api/login'.tap do |login|
    post login do
      req_username = params[:username] || ''
      req_password = params[:password] || ''
      raise AccessError.new(code: 400, message: 'Both of username and password are required.') if req_username.empty? || req_password.empty?

      user = Utility.get_user_by_username(req_username, @mysql)
      raise AccessError.new(code: 401, message: 'Invalid credentials.') unless Utility.correct_user?(user, req_password)

      logger.debug("user login: #{params[:username]}")

      response_body = {
        user_id: user[:id],
        access_token: generate_access_token(user[:username], user[:role])
      }

      return [200, json(response_body)]
    end
  end

  '/api/logout'.tap do |logout|
    post logout do
      token = request.env['HTTP_AUTHORIZATION']
      validate_access_token(token)

      File.open(TOKEN_REVOCATION_LIST_FILE, 'a') do |f|
        f.flock(File::LOCK_EX)
        f.puts token
      end

      return 200
    rescue StandardError
      raise AccessError.new(code: 401, message: 'Invalid credentials.')
    end
  end

  '/api/users'.tap do |users|
    post users do
      req_username = params[:username] || ''
      req_password = params[:password] || ''
      req_role = params[:role] || ''

      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') if req_username.empty? || req_password.empty? || req_role.empty?
      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') unless %w[audience artist].include? req_role
      raise AccessError.new(code: 409, message: 'A user who has same username exists. Consider using different username.') unless Utility.get_user_by_username(req_username, @mysql).nil?

      salt = Utility.password_salt
      password_hash = Utility.password_hash(salt, req_password)

      sql = "INSERT INTO users(username, role, password_hash, salt) \
             VALUES ('#{req_username}', '#{req_role}', '#{password_hash}', '#{salt}')"
      @mysql.query(sql)

      response_body = {
        user_id: @mysql.last_id,
        username: req_username,
        role: req_role
      }

      return [201, json(response_body)]
    end
  end

  '/api/users/:user_id'.tap do |user|
    get user do
      token = request.env['HTTP_AUTHORIZATION']
      payload = validate_access_token(token)
      username = payload[:username]

      validate_id_param(params[:user_id])

      target_user = Utility.get_user(params[:user_id], @mysql)
      raise AccessError.new(code: 404, message: 'Requested resource is not found.') if target_user.nil?

      if target_user[:username] != username
        raise AccessError.new(code: 403, message: 'Access declined.') if payload[:role] != 'owner'
      end

      response_body = {
        user_id: target_user[:id],
        username: target_user[:username],
        role: target_user[:role]
      }
      [200, json(response_body)]
    end
  end

  '/api/users/:user_id/reservations'.tap do |resv|
    get resv do
      req_limit = params[:limit] || '5'
      req_offset = params[:offset] || '0'

      token = request.env['HTTP_AUTHORIZATION']
      payload = validate_access_token(token)
      username = payload[:username]

      validate_id_param(params[:user_id])
      validate_role(payload[:role], %w[audience owner])
      validate_paging(req_limit, req_offset)

      target_user = Utility.get_user(params[:user_id], @mysql)
      raise AccessError.new(code: 404, message: 'Requested resource is not found.') if target_user.nil?

      if target_user[:username] != username
        raise AccessError.new(code: 403, message: 'Access declined.') if payload[:role] != 'owner'
      end

      reservations = Utility.get_reservations(@mysql, user_id: params[:user_id], limit: req_limit, offset: req_offset)

      response = reservations.map do |r|
        Utility.generate_reservation_response(r, @mysql)
      end

      [200, json(response)]
    end
  end

  '/api/genres'.tap do |genre|
    get genre do
      token = request.env['HTTP_AUTHORIZATION']
      payload = validate_access_token(token)

      validate_role(payload[:role], %w[artist owner])

      sql = 'SELECT * from eventgenres'
      genres = @mysql.query(sql).to_a

      [200, json(genres)]
    end
  end

  '/api/venues'.tap do |venues|
    get venues do
      req_limit = params[:limit] || '5'
      req_offset = params[:offset] || '0'

      token = request.env['HTTP_AUTHORIZATION']
      payload = validate_access_token(token)

      validate_role(payload[:role], %w[audience artist owner])
      validate_paging(req_limit, req_offset)

      venues = Utility.get_venues(@mysql, limit: req_limit, offset: req_offset)

      response = venues.map do |v|
        v[:created_at] = Utility.format_time(v[:created_at])
        v[:updated_at] = Utility.format_time(v[:updated_at])

        v
      end

      [200, json(response)]
    end
  end

  '/api/venues/:venue_id/timeslots'.tap do |timeslots|
    get timeslots do
      req_from = params[:from] || Utility.format_time(Time.now)
      req_to = params[:to] || Utility.end_of_month(Time.now)
      token = request.env['HTTP_AUTHORIZATION']
      payload = validate_access_token(token)

      validate_role(payload[:role], %w[artist owner])
      validate_id_param(params[:venue_id])
      begin
        req_from = Utility.parse_time(req_from) unless req_from.nil?
        req_to = Utility.parse_time(req_to) unless req_to.nil?
      rescue StandardError
        raise AccessError.new(code: 400, message: 'Type mismatch(es) exist.')
      end

      raise AccessError.new(code: 404, message: 'Requested resource is not found.') if Utility.get_venue(params[:venue_id], @mysql).nil?

      sql = "SELECT * FROM timeslots WHERE venue_id = #{params[:venue_id]} AND event_id IS NULL"

      sql += " AND start_at >= '#{req_from}'" unless req_from.nil?
      sql += " AND start_at <= '#{req_to}'" unless req_to.nil?

      timeslots = @mysql.query(sql).to_a

      response = timeslots.each do |t|
        t.delete(:event_id)
        t.delete(:venue_id)
        t[:created_at] = Utility.format_time(t[:created_at])
        t[:updated_at] = Utility.format_time(t[:updated_at])
        t[:start_at] = Utility.format_time(t[:start_at])
        t[:end_at] = Utility.format_time(t[:end_at])
      end

      [200, json(response)]
    end
  end

  '/api/events'.tap do |events|
    get events do
      req_artist_id = params[:user_id]
      req_limit = params[:limit] || '12'
      req_offset = params[:offset] || '0'

      validate_id_param(req_artist_id) unless req_artist_id.nil?
      validate_paging(req_limit, req_offset)

      events = Utility.get_events(@mysql, user_id: req_artist_id, limit: req_limit, offset: req_offset)

      response_body = []
      events.each do |e|
        response_body << Utility.generate_event_response(e, @mysql)
      end

      [200, json(response_body)]
    end

    post events do
      token = request.env['HTTP_AUTHORIZATION']
      payload = validate_access_token(token)
      username = payload[:username]
      user = Utility.get_user_by_username(username, @mysql)

      validate_role(payload[:role], %(artist))

      req_event_name = params[:event_name]
      req_event_genre_id = params[:event_genre_id]
      req_timeslot_ids = params[:timeslot_ids]
      req_price = params[:price]
      req_start_at = params[:start_at]
      req_end_at = params[:end_at]

      params = local_variables.map(&:to_s).select { |v| /^req_/.match? v }
      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') if params.any? { |p| binding.eval(p).nil? }
      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') if req_event_name.empty?
      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') unless req_price.is_a?(Integer) && req_price.positive?

      validate_event_genre(req_event_genre_id)

      validate_timeslot_ids(req_timeslot_ids)
      timeslots = []
      req_timeslot_ids.map do |id|
        sql = "SELECT * FROM timeslots WHERE id = #{id} FOR UPDATE"
        timeslots << @mysql.query(sql).to_a.first
      end
      validate_timeslots(timeslots)
      validate_start_end_time(req_start_at, req_end_at, timeslots)

      venue_id = timeslots.first[:venue_id]
      parsed_start_at = Utility.parse_time(req_start_at)
      parsed_end_at   = Utility.parse_time(req_end_at)

      @mysql.query('START TRANSACTION')
      sql = 'INSERT INTO events(user_id, venue_id, eventgenre_id, name, start_at, end_at, price)' \
            "VALUES(#{user[:id]}, #{venue_id}, #{req_event_genre_id}, '#{req_event_name}', '#{parsed_start_at}', "\
            "'#{parsed_end_at}', #{req_price})"
      @mysql.query(sql)
      event_id = @mysql.last_id

      req_timeslot_ids.each do |t|
        sql = "UPDATE timeslots SET event_id = #{event_id} WHERE id = #{t} AND event_id IS NULL"
        @mysql.query(sql)
        if @mysql.affected_rows.zero?
          @mysql.query('ROLLBACK')
          raise AccessError.new(code: 409, message: 'Selected timeslots are already reserved.')
        end
      end

      @mysql.query('COMMIT')

      event = Utility.get_event(event_id, @mysql)
      response = Utility.generate_event_response(event, @mysql)
      [201, json(response)]
    end
  end

  '/api/events/:event_id'.tap do |event|
    get event do
      validate_id_param(params[:event_id])

      event = Utility.get_event(params[:event_id], @mysql)

      raise AccessError.new(code: 404, message: 'Requested resource is not found.') if event.nil?

      response_body = Utility.generate_event_response(event, @mysql)

      [200, json(response_body)]
    end

    put event do
      validate_id_param(params[:event_id])
      event_id = params[:event_id].to_i

      token = request.env['HTTP_AUTHORIZATION']
      payload = validate_access_token(token)
      username = payload[:username]
      user = Utility.get_user_by_username(username, @mysql)
      validate_role(payload[:role], %w[artist owner])

      req_event_name = params[:event_name]
      req_event_genre_id = params[:event_genre_id]
      req_timeslot_ids = params[:timeslot_ids]
      req_price = params[:price]
      req_start_at = params[:start_at]
      req_end_at = params[:end_at]

      params = local_variables.map(&:to_s).select { |v| /^req_/.match? v }

      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') if params.any? { |p| binding.eval(p).nil? }
      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') if req_event_name.empty?
      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') unless req_price.is_a?(Integer) && req_price.positive?

      event = Utility.get_event(event_id, @mysql)
      raise AccessError.new(code: 404, message: 'Requested resource is not found.') if event.nil?
      raise AccessError.new(code: 403, message: 'Access declined.') unless Utility.accessible_event?(user, event)

      validate_event_genre(req_event_genre_id)

      validate_timeslot_ids(req_timeslot_ids)
      timeslots = []
      req_timeslot_ids.map do |id|
        sql = "SELECT * FROM timeslots WHERE id = #{id} FOR UPDATE"
        timeslots << @mysql.query(sql).to_a.first
      end
      validate_timeslots(timeslots)
      validate_start_end_time(req_start_at, req_end_at, timeslots)

      venue_id = timeslots.first[:venue_id]
      parsed_start_at = Utility.parse_time(req_start_at)
      parsed_end_at   = Utility.parse_time(req_end_at)
      old_timeslots = Utility.get_timeslots_by_event(event_id, @mysql)

      @mysql.query('START TRANSACTION')
      sql = 'UPDATE events ' \
            "SET venue_id = #{venue_id}, eventgenre_id = #{req_event_genre_id}, name = '#{req_event_name}', " \
                "start_at = '#{parsed_start_at}', end_at = '#{parsed_end_at}', price = #{req_price} " \
            "WHERE id = #{event_id}"
      @mysql.query(sql)

      old_timeslots.each do |t|
        sql = "UPDATE timeslots SET event_id = NULL WHERE id = #{t[:id]}"
        @mysql.query(sql)
      end

      req_timeslot_ids.each do |t|
        sql = "UPDATE timeslots SET event_id = #{event_id} WHERE id = #{t} AND event_id IS NULL"
        @mysql.query(sql)
        if @mysql.affected_rows.zero?
          @mysql.query('ROLLBACK')
          raise AccessError.new(code: 409, message: 'Selected timeslots are already reserved.')
        end
      end

      @mysql.query('COMMIT')

      updated_event = Utility.get_event(event_id, @mysql)
      response = Utility.generate_event_response(updated_event, @mysql)

      [200, json(response)]
    end
  end

  '/api/events/:event_id/image'.tap do |image|
    get image do
      validate_id_param(params[:event_id])

      event = Utility.get_event(params[:event_id], @mysql)
      raise AccessError.new(code: 404, message: 'Requested resource is not found.') if event.nil?

      sql = "SELECT image FROM events WHERE id = #{params[:event_id]}"
      image = @mysql.query(sql).to_a.first&.dig(:image)

      content_type 'image/png'

      if image.nil?
        send_file 'public/img/default.png', type: :png
      else
        [200, Base64.decode64(image)]
      end
    end

    put image do
      validate_id_param(params[:event_id])

      image = params[:image]

      token = request.env['HTTP_AUTHORIZATION']
      payload = validate_access_token(token)
      username = payload[:username]

      validate_role(payload[:role], %w[artist owner])

      user = Utility.get_user_by_username(username, @mysql)

      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') if image.nil?
      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') unless image[:type] == 'image/png'

      event = Utility.get_event(params[:event_id], @mysql)
      raise AccessError.new(code: 404, message: 'Requested resource is not found.') if event.nil?
      raise AccessError.new(code: 403, message: 'Access declined.') unless Utility.accessible_event?(user, event)

      sql = "UPDATE events SET image = '#{Base64.encode64(image[:tempfile].read)}' WHERE id = #{params[:event_id]}"
      @mysql.query(sql)

      [204]
    end
  end

  '/api/events/:event_id/reservations'.tap do |resv|
    get resv do
      validate_id_param(params[:event_id])

      req_limit = params[:limit] || '10'
      req_offset = params[:offset] || '0'

      token = request.env['HTTP_AUTHORIZATION']
      payload = validate_access_token(token)
      username = payload[:username]
      user = Utility.get_user_by_username(username, @mysql)

      validate_role(payload[:role], %w[artist owner])
      validate_paging(req_limit, req_offset)

      event = Utility.get_event(params[:event_id], @mysql)
      raise AccessError.new(code: 404, message: 'Requested resource is not found.') if event.nil?
      raise AccessError.new(code: 403, message: 'Access declined.') unless Utility.accessible_event?(user, event)

      reservations = Utility.get_reservations(@mysql, event_id: params[:event_id], limit: req_limit, offset: req_offset)

      response = reservations.map do |r|
        Utility.generate_reservation_response(r, @mysql)
      end

      [200, json(response)]
    end

    post resv do
      validate_id_param(params[:event_id])

      token = request.env['HTTP_AUTHORIZATION']
      payload = validate_access_token(token)
      username = payload[:username]
      event_id = params[:event_id]
      req_num_of_resv = params[:num_of_resv] || nil
      user = Utility.get_user_by_username(username, @mysql)

      validate_role(payload[:role], %w[audience])
      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') if req_num_of_resv.nil?
      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') unless req_num_of_resv.is_a?(Integer)
      raise AccessError.new(code: 400, message: 'Mandatory parameter(s) are missing.') unless req_num_of_resv > 0

      raise AccessError.new(code: 404, message: 'Requested resource is not found.') if Utility.get_event(event_id, @mysql).nil?

      event_capacity = Utility.event_capacity(event_id, @mysql)

      begin
        validate_reservation(user[:id], event_id, event_capacity, req_num_of_resv)

        @mysql.query('LOCK TABLE reservations WRITE')

        sql = "INSERT INTO reservations(user_id, event_id, num_of_resv) \
                VALUES(#{user[:id]}, #{event_id}, #{req_num_of_resv})"

        @mysql.query(sql)
        reservation = Utility.get_reservation(@mysql.last_id, @mysql)
      ensure
        @mysql.query('UNLOCK TABLE')
      end

      response = Utility.generate_reservation_response(reservation, @mysql)

      [201, json(response)]
    end
  end

  '/api/reservations/:reservation_id'.tap do |resv|
    get resv do
      validate_id_param(params[:reservation_id])

      token = request.env['HTTP_AUTHORIZATION']
      payload = validate_access_token(token)
      username = payload[:username]
      user = Utility.get_user_by_username(username, @mysql)

      validate_role(payload[:role], %w[audience owner])

      reservation = Utility.get_reservation(params[:reservation_id], @mysql)

      raise AccessError.new(code: 404, message: 'Requested resource is not found.') if reservation.nil?
      raise AccessError.new(code: 404, message: 'Requested resource is not found.') if Utility.get_event(reservation[:event_id], @mysql).nil?

      raise AccessError.new(code: 403) unless Utility.accessible_reservation?(user, reservation, @mysql)

      response = Utility.generate_reservation_response(reservation, @mysql)

      [200, json(response)]
    end

    delete resv do
      validate_id_param(params[:reservation_id])

      token = request.env['HTTP_AUTHORIZATION']
      payload = validate_access_token(token)
      username = payload[:username]
      user = Utility.get_user_by_username(username, @mysql)

      validate_role(payload[:role], %w[audience owner])

      reservation = Utility.get_reservation(params[:reservation_id], @mysql)

      raise AccessError.new(code: 404, message: 'Requested resource is not found.') if reservation.nil?
      raise AccessError.new(code: 404, message: 'Requested resource is not found.') if Utility.get_event(reservation[:event_id], @mysql).nil?

      raise AccessError.new(code: 403) unless Utility.accessible_reservation?(user, reservation, @mysql)

      sql = "DELETE FROM reservations where id = #{params[:reservation_id]}"

      @mysql.query(sql)

      content_type 'application/json'
      [204]
    end
  end
end
