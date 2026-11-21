# 原因：iOS 签名参数的解析与校验抽成纯 Ruby，Fastfile 只负责调用 fastlane 动作，便于在没有证书的机器上测试
# 边界：只读取环境变量并返回解析结果，绝不输出变量取值；证书与描述文件本身不进入仓库

module IosSigning
  EXPORT_METHODS = %w[ad-hoc app-store enterprise development].freeze

  # 原因：fastlane match 的 type 取值与 Xcode 导出方式命名不同，集中映射避免散落在 lane 里
  MATCH_TYPES = {
    'ad-hoc' => 'adhoc',
    'app-store' => 'appstore',
    'enterprise' => 'enterprise',
    'development' => 'development'
  }.freeze

  TEAM_ID_PATTERN = /\A[A-Z0-9]{10}\z/.freeze

  class ConfigError < StandardError; end

  Result = Struct.new(:mode, :team_id, :profile_name, :match_type, :warning, keyword_init: true)

  def self.clean(value)
    text = value.to_s.strip
    text.empty? ? nil : text
  end

  # mode 取值：
  #   :match     设置了 MATCH_GIT_URL，描述文件交给 fastlane match 管理
  #   :manual    使用 IOS_TEAM_ID 与 IOS_PROVISIONING_PROFILE 手动签名
  #   :automatic development 导出只提供 IOS_TEAM_ID 时，由 Xcode 自动管理签名（Expo 生成的工程不带 Team，必须显式指定）
  def self.resolve(export_method:, env:)
    unless EXPORT_METHODS.include?(export_method)
      raise ConfigError, "Unsupported export_method '#{export_method}'. Expected one of: #{EXPORT_METHODS.join(', ')}"
    end

    team_id = clean(env['IOS_TEAM_ID'])
    profile_name = clean(env['IOS_PROVISIONING_PROFILE'])
    match_url = clean(env['MATCH_GIT_URL'])

    if team_id && !TEAM_ID_PATTERN.match?(team_id)
      raise ConfigError, 'IOS_TEAM_ID must be the 10-character Apple Team ID (uppercase letters and digits).'
    end

    if match_url
      raise ConfigError, 'MATCH_GIT_URL is set, so IOS_TEAM_ID is also required.' unless team_id
      # 原因：无人值守的内部 Mac 上缺少 MATCH_PASSWORD 时 match 会卡在交互提示，提前失败比挂起更好
      raise ConfigError, 'MATCH_GIT_URL is set, so MATCH_PASSWORD is also required for non-interactive runs.' unless clean(env['MATCH_PASSWORD'])

      warning = profile_name ? 'IOS_PROVISIONING_PROFILE is ignored because MATCH_GIT_URL is set.' : nil
      return Result.new(mode: :match, team_id: team_id, profile_name: nil, match_type: MATCH_TYPES.fetch(export_method), warning: warning)
    end

    # 原因：development 导出没有提供描述文件时交给 Xcode 自动签名，但自动签名也必须指定 Team
    if export_method == 'development' && profile_name.nil?
      raise ConfigError, "iOS signing is not configured for export_method 'development'. Missing: IOS_TEAM_ID." unless team_id

      return Result.new(mode: :automatic, team_id: team_id)
    end

    missing = []
    missing << 'IOS_TEAM_ID' unless team_id
    missing << 'IOS_PROVISIONING_PROFILE' unless profile_name
    unless missing.empty?
      raise ConfigError,
            "iOS signing is not configured for export_method '#{export_method}'. Missing: #{missing.join(', ')}. " \
            'Set them, or set MATCH_GIT_URL to use fastlane match.'
    end

    Result.new(mode: :manual, team_id: team_id, profile_name: profile_name)
  end
end
