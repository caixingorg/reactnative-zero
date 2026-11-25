# 原因：遵循 ADR-0006，把 Hermes 合成 SourceMap、iOS dSYM 与 Android mapping.txt 的上传前规划抽成纯 Ruby，
# 缺凭证时仅告警跳过不阻断本地出包，支持 dry_run 打印待上传清单，且无需真实 sentry-cli 即可在单测中验证
require 'uri'

module DebugSymbols
  Plan = Struct.new(:status, :warning, :commands, :artifacts, keyword_init: true)

  REQUIRED_ENV_KEYS = %w[SENTRY_AUTH_TOKEN SENTRY_ORG SENTRY_PROJECT].freeze
  PRODUCTION_URL_KEYS = %w[
    EXPO_PUBLIC_API_BASE_URL
    EXPO_PUBLIC_PRIVACY_POLICY_URL
    EXPO_PUBLIC_USER_AGREEMENT_URL
  ].freeze

  def self.clean(value)
    text = value.to_s.strip
    text.empty? ? nil : text
  end

  # 原因：Fastlane 正式发版前拦截 production.env 或 ENV 中的 example.com 占位域名
  def self.find_placeholder_domains(env_map)
    offending = []
    PRODUCTION_URL_KEYS.each do |key|
      raw = clean(env_map[key])
      next unless raw

      begin
        host = URI.parse(raw).host.to_s.downcase
        if host == 'example.com' || host.end_with?('.example.com')
          offending << "#{key}=#{raw}"
        end
      rescue URI::InvalidURIError
        next
      end
    end
    offending
  end

  def self.parse_env_file(file_path)
    result = {}
    return result unless File.exist?(file_path)

    File.readlines(file_path, chomp: true).each do |line|
      match = /\A\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*\z/.match(line)
      next unless match

      result[match[1]] = match[2].gsub(/\A['"]|['"]\z/, '')
    end
    result
  end

  def self.collect_artifacts(platform:, project_root:, dsym_path: nil)
    artifacts = []
    if platform.to_s == 'android'
      # 原因：必须上传 Hermes 合成 SourceMap（非原始 Metro map）及 R8/ProGuard mapping.txt
      hermes_map = File.join(project_root, 'android/app/build/generated/sourcemaps/react/release/index.android.bundle.map')
      mapping_txt = File.join(project_root, 'android/app/build/outputs/mapping/release/mapping.txt')
      artifacts << { kind: :sourcemap, path: hermes_map } if File.exist?(hermes_map)
      artifacts << { kind: :proguard, path: mapping_txt } if File.exist?(mapping_txt)
    elsif platform.to_s == 'ios'
      ios_map = File.join(project_root, 'ios/main.jsbundle.map')
      artifacts << { kind: :sourcemap, path: ios_map } if File.exist?(ios_map)

      resolved_dsym = clean(dsym_path) || Dir[File.join(project_root, 'dist/ios/*.app.dSYM.zip')].first
      artifacts << { kind: :dsym, path: resolved_dsym } if resolved_dsym && File.exist?(resolved_dsym)
    end
    artifacts
  end

  def self.plan_upload(platform:, project_root:, env:, dry_run: false, dsym_path: nil)
    artifacts = collect_artifacts(platform: platform, project_root: project_root, dsym_path: dsym_path)
    missing_env = REQUIRED_ENV_KEYS.select { |key| clean(env[key]).nil? }

    if dry_run
      warning = missing_env.empty? ? nil : "Dry run without credentials (missing: #{missing_env.join(', ')})."
      return Plan.new(status: :dry_run, warning: warning, commands: build_commands(artifacts, env), artifacts: artifacts)
    end

    unless missing_env.empty?
      return Plan.new(
        status: :skipped,
        warning: "Skipping debug symbol upload: missing #{missing_env.join(', ')}.",
        commands: [],
        artifacts: artifacts
      )
    end

    if artifacts.empty?
      return Plan.new(
        status: :skipped,
        warning: "Skipping debug symbol upload: no composed Hermes source maps or native symbol files found for #{platform}.",
        commands: [],
        artifacts: []
      )
    end

    Plan.new(status: :ready, warning: nil, commands: build_commands(artifacts, env), artifacts: artifacts)
  end

  def self.build_commands(artifacts, env)
    org = clean(env['SENTRY_ORG']) || '<SENTRY_ORG>'
    project = clean(env['SENTRY_PROJECT']) || '<SENTRY_PROJECT>'
    base = ['sentry-cli']
    sentry_url = clean(env['SENTRY_URL'])
    base += ['--url', sentry_url] if sentry_url

    artifacts.map do |item|
      case item[:kind]
      when :sourcemap
        base + ['sourcemaps', 'upload', '--org', org, '--project', project, item[:path]]
      when :dsym
        base + ['debug-files', 'upload', '--org', org, '--project', project, item[:path]]
      when :proguard
        base + ['upload-proguard', '--org', org, '--project', project, item[:path]]
      end
    end.compact
  end
end
